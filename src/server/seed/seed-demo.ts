import { eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { loadStaffActor } from "@/server/auth/sessions";
import { createCtx, type Ctx } from "@/server/core/context";
import { storeUpload } from "@/server/modules/files/service";
import { handlePaymentCallback, recordManualPayment, startOnlinePayment } from "@/server/modules/finance/service";
import { issueInvoice } from "@/server/modules/finance/invoices";
import { addCartItem, cartView, getOrCreateCart } from "@/server/modules/orders/cart";
import { approveOrder, requestInfo, setOrderPrice } from "@/server/modules/orders/approval";
import { reviewArtwork, startDesign } from "@/server/modules/orders/artwork";
import { checkout, createCustomOrder, type CustomOrderInput } from "@/server/modules/orders/create";
import { addSupplierQuote, decidePaperSupplier, markPaperReceived, saveLithoJob } from "@/server/modules/offset/service";
import { dispatchOrder, markDelivered } from "@/server/modules/shipping/service";
import { assignMachine, completeStep, decideQuality, setPriority, startStep } from "@/server/modules/workflow/engine";
import type { ReferenceIds } from "./seed-reference";

const PDF = Buffer.from("%PDF-1.4\n% Honar Afagh demo artwork\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n");

export const DEMO_CUSTOMERS = [
  { phone: "09121111111", fullName: "سارا احمدی", type: "INDIVIDUAL" as const, nationalId: "0012345678" },
  { phone: "09122222222", fullName: "حمید صالحی", type: "COMPANY" as const, companyName: "شرکت پخش البرز", nationalId: "10320654789", economicCode: "411477852369", billingAddress: "تهران، خیابان مطهری، پلاک ۴۰" },
  { phone: "09123333333", fullName: "مریم کاظمی", type: "INDIVIDUAL" as const },
  { phone: "09124444444", fullName: "رضا نیک‌پور", type: "COMPANY" as const, companyName: "کافه رستوران سپیدار", nationalId: "14006543210", economicCode: "411099887766", billingAddress: "تهران، شهرک غرب، بلوار دادمان" },
  { phone: "09125555555", fullName: "نازنین رحیمی", type: "INDIVIDUAL" as const },
  { phone: "09126666666", fullName: "علی مرادی", type: "COMPANY" as const, companyName: "انتشارات نگاه نو", nationalId: "10102233445", economicCode: "411566778899", billingAddress: "تهران، خیابان انقلاب، کوچه مینو" },
];

/**
 * A realistic snapshot of the printing house: Digital and Offset orders at
 * every stage, created through the real services (so every record is
 * consistent), then aged so queues and history look like a working week.
 */
export async function seedDemo(db: Database, ref: ReferenceIds) {
  const staff = async (key: string) => createCtx((await loadStaffActor(db, ref.employees.get(key)!.userId))!);
  const s = {
    hamed: await staff("hamed"),
    labafi: await staff("labafi"),
    azad: await staff("azad"),
    abdali: await staff("abdali"),
    gholipour: await staff("gholipour"),
    hajghasemi: await staff("hajghasemi"),
    memarian: await staff("memarian"),
  };
  const customers: { id: string; ctx: Ctx }[] = [];
  for (const c of DEMO_CUSTOMERS) {
    const [u] = await db.insert(t.users).values({ phone: c.phone, fullName: c.fullName, kind: "CUSTOMER" }).returning();
    const [row] = await db.insert(t.customers).values({ ...c, userId: u!.id }).returning();
    await db.insert(t.addresses).values({ customerId: row!.id, title: "محل کار", province: "تهران", city: "تهران", line: c.billingAddress ?? "تهران، خیابان آزادی، پلاک ۱۲", recipientName: c.fullName, recipientPhone: c.phone, isDefault: true });
    customers.push({ id: row!.id, ctx: createCtx({ kind: "customer", userId: u!.id, customerId: row!.id, name: c.fullName }) });
  }
  const [sara, hamid, maryam, reza, nazanin, ali] = customers as [(typeof customers)[number], (typeof customers)[number], (typeof customers)[number], (typeof customers)[number], (typeof customers)[number], (typeof customers)[number]];

  let key = 0;
  const order = async (c: { ctx: Ctx }, input: Omit<CustomOrderInput, "idempotencyKey" | "artworkFileIds"> & { file?: string }) => {
    const fileIds = input.file ? [(await storeUpload(c.ctx, { data: PDF, filename: input.file, purpose: "ARTWORK" })).id] : [];
    return createCustomOrder(c.ctx, { ...input, artworkFileIds: fileIds, idempotencyKey: `seed-${++key}` });
  };
  const step = async (orderId: string, k: string) => (await db.select().from(t.productionSteps).where(eq(t.productionSteps.orderId, orderId))).find((x) => x.key === k)!.id;
  const approveArt = async (orderId: string, who: Ctx) => {
    const [a] = await db.select().from(t.artworkFiles).where(eq(t.artworkFiles.orderId, orderId));
    await reviewArtwork(who, a!.id, { approve: true });
  };
  const run = async (orderId: string, who: Ctx, keys: string[]) => {
    for (const k of keys) await completeStep(who, await step(orderId, k));
  };
  const paper = (sku: string) => ref.materials.get(sku)!;
  const sup = (k: string) => ref.suppliers.get(k)!;
  const press = (code: string) => ref.machines.get(code)!;
  const payCash = (orderId: string, amount: number) => recordManualPayment(s.abdali, orderId, { method: "POS", amount, idempotencyKey: `seed-${orderId.slice(0, 8)}` });
  const DIGITAL_FULL = ["D_SHEET", "D_PAPER", "D_PRINT", "D_CUT", "D_LAMINATION", "D_QUALITY", "D_PACKAGING"];

  // ── Digital ────────────────────────────────────────────────────────────────
  const d1 = await order(sara, { productionType: "DIGITAL", title: "کارت ویزیت شخصی", quantity: 200, dimensions: "۵×۹ سانتی‌متر", material: "کتان ۳۰۰ گرم", colors: "چهاررنگ دو رو", finishing: "گوشه گرد", needsDesign: false, file: "business-card.pdf" });
  const d2 = await order(maryam, { productionType: "DIGITAL", title: "کارت دعوت جشن تولد", quantity: 80, dimensions: "A6", material: "گلاسه ۳۰۰", colors: "چهاررنگ یک رو", finishing: "سلفون براق", needsDesign: true, requestedDeadline: new Date(Date.now() + 5 * 86_400_000) });
  const d3 = await order(nazanin, { productionType: "DIGITAL", title: "پوستر نمایشگاه نقاشی", quantity: 15, dimensions: "۵۰×۷۰", material: "", colors: "چهاررنگ", needsDesign: false, file: "poster.pdf" });
  await requestInfo(s.labafi, d3.id, { notes: "جنس کاغذ پوستر را مشخص کنید؛ گلاسه ۱۷۰ یا فتو گلاسه؟" });

  const d4 = await order(reza, { productionType: "DIGITAL", title: "منوی رستوران", quantity: 40, dimensions: "A4 دولت", material: "گلاسه ۳۰۰", colors: "چهاررنگ دو رو", finishing: "سلفون مات", needsDesign: false, file: "menu.pdf" });
  await approveOrder(s.labafi, d4.id, { steps: ["D_SHEET", "D_PAPER", "D_PRINT", "D_CUT", "D_LAMINATION", "D_PACKAGING"] });
  await setOrderPrice(s.abdali, d4.id, { amount: 9_500_000, discount: 0 });
  await approveArt(d4.id, s.labafi);
  await run(d4.id, s.azad, ["D_SHEET"]);
  await completeStep(s.azad, await step(d4.id, "D_PAPER"), { materialId: paper("P-GL300-SRA3"), quantity: 25 });
  await startStep(s.azad, await step(d4.id, "D_PRINT"));
  await setPriority(s.labafi, d4.id, { isPriority: true, reason: "افتتاحیه رستوران پنجشنبه است", charge: 1_500_000 });

  const d5 = await order(sara, { productionType: "DIGITAL", title: "برچسب شیشه عسل", quantity: 500, dimensions: "دایره ۶ سانتی‌متر", material: "استیکر گلاسه", colors: "چهاررنگ", finishing: "برش فرم", needsDesign: false, file: "label.pdf" });
  await approveOrder(s.labafi, d5.id, { steps: ["D_PAPER", "D_PRINT", "D_CUT", "D_PACKAGING"] });
  await setOrderPrice(s.abdali, d5.id, { amount: 6_200_000, discount: 200_000 });
  await approveArt(d5.id, s.labafi);
  await completeStep(s.azad, await step(d5.id, "D_PAPER"), { materialId: paper("P-STK-SRA3"), quantity: 30 });
  await run(d5.id, s.azad, ["D_PRINT"]);

  const d6 = await order(hamid, { productionType: "DIGITAL", title: "کاتالوگ محصولات (نسخه نمونه)", quantity: 30, dimensions: "A4", material: "گلاسه ۱۳۵ و جلد ۳۰۰", colors: "چهاررنگ", finishing: "سلفون جلد، صحافی منگنه", needsDesign: false, file: "catalog.pdf" });
  await approveOrder(s.hamed, d6.id, { steps: [...DIGITAL_FULL, "D_BINDING"], price: { amount: 14_000_000 } });
  await approveArt(d6.id, s.labafi);
  await run(d6.id, s.azad, ["D_SHEET"]);
  await completeStep(s.azad, await step(d6.id, "D_PAPER"), { materialId: paper("P-GL135-SRA3"), quantity: 120 });
  await run(d6.id, s.azad, ["D_PRINT", "D_CUT", "D_LAMINATION", "D_BINDING"]);
  await payCash(d6.id, 7_000_000);

  const d7 = await order(ali, { productionType: "DIGITAL", title: "جلد کتاب (نمونه چاپ)", quantity: 10, dimensions: "رقعی", material: "گلاسه ۳۰۰", colors: "چهاررنگ", finishing: "سلفون مات", needsDesign: false, file: "cover.pdf" });
  await approveOrder(s.labafi, d7.id, { steps: DIGITAL_FULL });
  await setOrderPrice(s.abdali, d7.id, { amount: 2_400_000, discount: 0 });
  await approveArt(d7.id, s.labafi);
  await run(d7.id, s.azad, ["D_SHEET"]);
  await completeStep(s.azad, await step(d7.id, "D_PAPER"), { materialId: paper("P-GL300-SRA3"), quantity: 5 });
  await run(d7.id, s.azad, ["D_PRINT", "D_CUT", "D_LAMINATION"]);
  await decideQuality(s.labafi, await step(d7.id, "D_QUALITY"), { approve: true });
  await run(d7.id, s.labafi, ["D_PACKAGING"]);
  await payCash(d7.id, 2_640_000);

  const d8 = await order(nazanin, { productionType: "DIGITAL", title: "عکس‌های چاپی آلبوم", quantity: 60, dimensions: "۱۳×۱۸", material: "فتو گلاسه", colors: "چهاررنگ", needsDesign: false, file: "photos.zip.pdf" });
  await approveOrder(s.labafi, d8.id, { steps: ["D_PRINT", "D_CUT", "D_PACKAGING"], price: { amount: 3_000_000 } });
  await approveArt(d8.id, s.labafi);
  await run(d8.id, s.azad, ["D_PRINT", "D_CUT"]);
  await run(d8.id, s.labafi, ["D_PACKAGING"]);
  await payCash(d8.id, 3_300_000);
  await dispatchOrder(s.labafi, d8.id, { method: "POST", carrierName: "پست پیشتاز", trackingCode: "۱۲۳۴۵۶۷۸۹۰۱۲" });

  const d9 = await order(reza, { productionType: "DIGITAL", title: "کارت تخفیف مشتریان", quantity: 300, dimensions: "۵×۹", material: "گلاسه ۳۰۰", colors: "چهاررنگ دو رو", finishing: "سلفون براق", needsDesign: false, file: "discount-card.pdf" });
  await approveOrder(s.labafi, d9.id, { steps: DIGITAL_FULL });
  await setOrderPrice(s.abdali, d9.id, { amount: 4_800_000, discount: 0 });
  await approveArt(d9.id, s.labafi);
  await run(d9.id, s.azad, ["D_SHEET"]);
  await completeStep(s.azad, await step(d9.id, "D_PAPER"), { materialId: paper("P-GL300-SRA3"), quantity: 15 });
  await run(d9.id, s.azad, ["D_PRINT", "D_CUT", "D_LAMINATION"]);
  await decideQuality(s.labafi, await step(d9.id, "D_QUALITY"), { approve: true });
  await run(d9.id, s.labafi, ["D_PACKAGING"]);
  await payCash(d9.id, 5_280_000);
  await dispatchOrder(s.labafi, d9.id, { method: "COURIER", recipientName: "رضا نیک‌پور" });
  await markDelivered(s.labafi, d9.id, { recipientName: "رضا نیک‌پور" });
  await issueInvoice(s.abdali, d9.id);

  const d10 = await order(maryam, { productionType: "DIGITAL", title: "لوگو و کارت ویزیت آرایشگاه", quantity: 500, dimensions: "۵×۹", material: "کتان ۳۰۰", colors: "چهاررنگ", needsDesign: true });
  await approveOrder(s.labafi, d10.id, { steps: ["D_SHEET", "D_PAPER", "D_PRINT", "D_CUT", "D_PACKAGING"] });
  await setOrderPrice(s.abdali, d10.id, { amount: 7_500_000, discount: 0 });
  await startDesign(s.memarian, d10.id);

  // ── Offset ─────────────────────────────────────────────────────────────────
  const OFFSET_STD = ["O_LITHO", "O_PAPER", "O_PRINT", "O_CUT", "O_PACKAGING", "O_SHIPPING"];
  const o1 = await order(ali, { productionType: "OFFSET", title: "کتاب «باغ‌های ایرانی» — ۲۰۰۰ نسخه", quantity: 2000, dimensions: "وزیری، ۲۴۰ صفحه", material: "تحریر ۷۰ و جلد گلاسه ۳۰۰", colors: "متن تک‌رنگ، جلد چهاررنگ", finishing: "سلفون مات جلد، صحافی ته‌چسب", needsDesign: false, file: "book.pdf", requestedDeadline: new Date(Date.now() + 14 * 86_400_000) });

  const o2 = await order(hamid, { productionType: "OFFSET", title: "بروشور سه‌لت معرفی محصولات", quantity: 10_000, dimensions: "A4 سه‌لت", material: "گلاسه ۱۳۵", colors: "چهاررنگ دو رو", finishing: "برش و تا", needsDesign: false, file: "brochure.pdf" });
  await approveOrder(s.gholipour, o2.id, { steps: OFFSET_STD });
  await setOrderPrice(s.abdali, o2.id, { amount: 98_000_000, discount: 3_000_000 });
  await addSupplierQuote(s.gholipour, o2.id, { supplierId: sup("paper-pars"), price: 48_000_000, notes: "۱۲۰ بند، تحویل امروز" });
  await addSupplierQuote(s.gholipour, o2.id, { supplierId: sup("paper-arya"), price: 51_500_000 });
  await addSupplierQuote(s.gholipour, o2.id, { supplierId: sup("paper-sepid"), price: 46_800_000, notes: "تحویل فردا صبح" });

  const o3 = await order(reza, { productionType: "OFFSET", title: "ساک دستی کاغذی", quantity: 3000, dimensions: "۲۵×۳۵×۱۰", material: "مقوا ۲۵۰", colors: "دو رنگ", finishing: "سلفون مات، قالب و چسب", needsDesign: false, file: "bag.pdf" });
  await approveOrder(s.hamed, o3.id, { steps: ["O_LITHO", "O_PAPER", "O_PRINT", "O_CUT", "O_LAMINATION", "O_PACKAGING"], price: { amount: 135_000_000 } });
  await approveArt(o3.id, s.gholipour);
  const q3 = await addSupplierQuote(s.gholipour, o3.id, { supplierId: sup("paper-pars"), price: 62_000_000 });
  await addSupplierQuote(s.gholipour, o3.id, { supplierId: sup("paper-sepid"), price: 64_500_000 });
  await decidePaperSupplier(s.hamed, o3.id, { quoteId: q3.id, notes: "خرید از پارس" });
  await saveLithoJob(s.gholipour, o3.id, { supplierId: sup("litho-novin"), status: "IN_PROGRESS", price: 9_000_000, expectedAt: new Date(Date.now() + 86_400_000) });
  await payCash(o3.id, 70_000_000);

  const offsetToPress = async (id: string, opts: { litho?: string; paper?: string; price: number } = { price: 0 }) => {
    await approveArt(id, s.gholipour);
    const q = await addSupplierQuote(s.gholipour, id, { supplierId: sup(opts.paper ?? "paper-pars"), price: opts.price });
    await decidePaperSupplier(s.hamed, id, { quoteId: q.id });
    await markPaperReceived(s.gholipour, id, { note: "کاغذ رسید" });
    await saveLithoJob(s.gholipour, id, { supplierId: sup(opts.litho ?? "litho-novin"), status: "ORDERED", price: 6_000_000 });
    await saveLithoJob(s.gholipour, id, { supplierId: sup(opts.litho ?? "litho-novin"), status: "RECEIVED" });
  };

  const o4 = await order(sara, { productionType: "OFFSET", title: "تراکت تبلیغاتی آموزشگاه", quantity: 20_000, dimensions: "A5", material: "تحریر ۸۰", colors: "چهاررنگ یک رو", needsDesign: false, file: "flyer.pdf" });
  await approveOrder(s.gholipour, o4.id, { steps: OFFSET_STD, price: { amount: 42_000_000 } });
  await offsetToPress(o4.id, { price: 18_000_000 });
  await assignMachine(s.hajghasemi, await step(o4.id, "O_PRINT"), press("OFF-4C"));
  await setPriority(s.gholipour, o4.id, { isPriority: true, reason: "مشتری هزینه فوری پرداخت کرد", charge: 4_000_000 });

  const o5 = await order(nazanin, { productionType: "OFFSET", title: "سربرگ و پاکت اداری", quantity: 5000, dimensions: "A4 و پاکت ملخی", material: "تحریر ۸۰", colors: "دو رنگ", needsDesign: false, file: "letterhead.pdf" });
  await approveOrder(s.abdali, o5.id, { steps: OFFSET_STD, price: { amount: 28_000_000 } });
  await offsetToPress(o5.id, { paper: "paper-arya", litho: "litho-ziba", price: 9_500_000 });

  const o6 = await order(hamid, { productionType: "OFFSET", title: "کارتن بسته‌بندی محصول", quantity: 8000, dimensions: "۲۰×۱۵×۸", material: "مقوا پشت‌طوسی ۴۵۰", colors: "چهاررنگ", finishing: "سلفون براق و قالب", needsDesign: false, file: "box.pdf" });
  await approveOrder(s.gholipour, o6.id, { steps: [...OFFSET_STD, "O_LAMINATION"], price: { amount: 210_000_000 } });
  await offsetToPress(o6.id, { price: 85_000_000 });
  await assignMachine(s.gholipour, await step(o6.id, "O_PRINT"), press("OFF-8C"));
  await startStep(s.hajghasemi, await step(o6.id, "O_PRINT"));
  await payCash(o6.id, 105_000_000);

  const o7 = await order(ali, { productionType: "OFFSET", title: "پوستر فیلم سینمایی", quantity: 3000, dimensions: "۵۰×۷۰", material: "گلاسه ۱۷۰", colors: "چهاررنگ", needsDesign: false, file: "film-poster.pdf" });
  await approveOrder(s.gholipour, o7.id, { steps: ["O_LITHO", "O_PAPER", "O_PRINT", "O_CUT", "O_PACKAGING"], price: { amount: 64_000_000 } });
  await offsetToPress(o7.id, { price: 21_000_000 });
  await assignMachine(s.hajghasemi, await step(o7.id, "O_PRINT"), press("OFF-4C"));
  await run(o7.id, s.hajghasemi, ["O_PRINT"]);

  const o8 = await order(reza, { productionType: "OFFSET", title: "زیرلیوانی کاغذی کافه", quantity: 10_000, dimensions: "دایره ۹ سانتی‌متر", material: "مقوا ۳۰۰", colors: "تک‌رنگ", finishing: "قالب‌زنی", needsDesign: false, file: "coaster.pdf" });
  await approveOrder(s.gholipour, o8.id, { steps: ["O_LITHO", "O_PAPER", "O_PRINT", "O_CUT", "O_PACKAGING"], price: { amount: 36_000_000 } });
  await offsetToPress(o8.id, { price: 12_000_000 });
  await assignMachine(s.hajghasemi, await step(o8.id, "O_PRINT"), press("OFF-1C"));
  await run(o8.id, s.hajghasemi, ["O_PRINT"]);
  await decideQuality(s.hamed, await step(o8.id, "O_PRINT_QUALITY"), { approve: true, notes: "رنگ یکدست" });

  const o9 = await order(sara, { productionType: "OFFSET", title: "دفترچه یادداشت تبلیغاتی", quantity: 1000, dimensions: "A5، ۸۰ برگ", material: "تحریر ۷۰ و جلد ۳۰۰", colors: "جلد چهاررنگ", finishing: "سلفون، صحافی سیمی", needsDesign: false, file: "notebook.pdf" });
  await approveOrder(s.hamed, o9.id, { steps: [...OFFSET_STD, "O_LAMINATION", "O_BINDING"], price: { amount: 88_000_000 } });
  await offsetToPress(o9.id, { price: 30_000_000 });
  await assignMachine(s.hajghasemi, await step(o9.id, "O_PRINT"), press("OFF-4C"));
  await run(o9.id, s.hajghasemi, ["O_PRINT"]);
  await decideQuality(s.hamed, await step(o9.id, "O_PRINT_QUALITY"), { approve: true });
  await run(o9.id, s.gholipour, ["O_CUT"]);
  await run(o9.id, s.hajghasemi, ["O_LAMINATION", "O_BINDING"]);
  await payCash(o9.id, 50_000_000);

  const o10 = await order(ali, { productionType: "OFFSET", title: "کارت پستال مجموعه‌ای", quantity: 4000, dimensions: "A6", material: "گلاسه ۳۰۰", colors: "چهاررنگ دو رو", finishing: "سلفون مات", needsDesign: false, file: "postcards.pdf" });
  await approveOrder(s.gholipour, o10.id, { steps: [...OFFSET_STD, "O_LAMINATION"], price: { amount: 52_000_000 } });
  await offsetToPress(o10.id, { price: 16_000_000 });
  await assignMachine(s.hajghasemi, await step(o10.id, "O_PRINT"), press("OFF-4C"));
  await run(o10.id, s.hajghasemi, ["O_PRINT"]);
  await decideQuality(s.hamed, await step(o10.id, "O_PRINT_QUALITY"), { approve: true });
  await run(o10.id, s.gholipour, ["O_CUT"]);
  await run(o10.id, s.hajghasemi, ["O_LAMINATION"]);
  await decideQuality(s.hamed, await step(o10.id, "O_FINAL_QUALITY"), { approve: true });
  await run(o10.id, s.hajghasemi, ["O_PACKAGING"]);
  await payCash(o10.id, 57_200_000);

  const o11 = await order(hamid, { productionType: "OFFSET", title: "کاتالوگ سالانه شرکت", quantity: 1500, dimensions: "A4، ۴۸ صفحه", material: "گلاسه ۱۳۵ و جلد ۳۰۰", colors: "چهاررنگ", finishing: "سلفون جلد، منگنه", needsDesign: false, file: "annual-catalog.pdf" });
  await approveOrder(s.hamed, o11.id, { steps: [...OFFSET_STD, "O_BINDING"], price: { amount: 145_000_000 } });
  await offsetToPress(o11.id, { price: 58_000_000 });
  await assignMachine(s.hajghasemi, await step(o11.id, "O_PRINT"), press("OFF-4C"));
  await run(o11.id, s.hajghasemi, ["O_PRINT"]);
  await decideQuality(s.hamed, await step(o11.id, "O_PRINT_QUALITY"), { approve: true });
  await run(o11.id, s.gholipour, ["O_CUT"]);
  await run(o11.id, s.hajghasemi, ["O_BINDING"]);
  await decideQuality(s.hamed, await step(o11.id, "O_FINAL_QUALITY"), { approve: true });
  await run(o11.id, s.hajghasemi, ["O_PACKAGING"]);
  await payCash(o11.id, 159_500_000);
  await dispatchOrder(s.hajghasemi, o11.id, { method: "EXTERNAL", carrierName: "باربری ایران‌پیما", trackingCode: "BRN-44821" });
  await markDelivered(s.gholipour, o11.id, { recipientName: "انبار شرکت پخش البرز" });
  await issueInvoice(s.abdali, o11.id);

  const o12 = await order(maryam, { productionType: "OFFSET", title: "کارت عروسی", quantity: 400, dimensions: "۱۲×۱۷", material: "کتان ۳۰۰", colors: "چهاررنگ و طلاکوب", needsDesign: true });
  await approveOrder(s.gholipour, o12.id, { steps: OFFSET_STD, price: { amount: 18_000_000 } });

  // ── A store purchase paid online, waiting for approval ─────────────────────
  const cart = await getOrCreateCart(nazanin.ctx);
  await addCartItem(nazanin.ctx, cart, { productId: ref.products.get("business-card")!, quantity: 500, selections: { lamination: "matte" }, urgency: "STANDARD" });
  const view = await cartView(nazanin.ctx, cart);
  const total = view.subtotal + Math.round(view.subtotal * view.vatPct / 100);
  const store = await checkout(nazanin.ctx, { deliveryMethodId: ref.deliveryMethods.get("PICKUP")!, expectedTotal: total, idempotencyKey: "seed-store" });
  const pay = await startOnlinePayment(nazanin.ctx, store.orders[0]!.id, { idempotencyKey: "seed-store" });
  const authority = new URL(pay.redirectUrl).searchParams.get("authority")!;
  await handlePaymentCallback("fake", new URLSearchParams({ pid: pay.paymentId, Authority: authority, Status: "OK" }));

  // ── Make it look like a working week: older orders further back in time ──
  const ages: [string, number][] = [
    [o11.id, 240], [d9.id, 200], [o10.id, 150], [o9.id, 130], [o6.id, 110], [o8.id, 96], [o7.id, 90], [d6.id, 80], [o5.id, 72], [d7.id, 70], [o4.id, 60],
    [d8.id, 54], [o3.id, 50], [d4.id, 30], [d5.id, 26], [o2.id, 22], [d10.id, 20], [o12.id, 18], [d3.id, 12], [o1.id, 6], [d1.id, 4], [d2.id, 2], [store.orders[0]!.id, 1],
  ];
  for (const [id, hours] of ages) await ageOrder(db, id, hours);
  // One order past its requested date, so the manager sees the alert.
  await db.update(t.orders).set({ requestedDeadline: new Date(Date.now() - 86_400_000) }).where(eq(t.orders.id, o9.id));
}

/** Moves an order's history back in time, keeping its internal sequence. */
async function ageOrder(db: Database, orderId: string, hours: number) {
  const shift = sql`make_interval(hours => ${hours})`;
  const id = sql`${orderId}::uuid`;
  await db.execute(sql`UPDATE orders SET created_at = created_at - ${shift}, approved_at = approved_at - ${shift}, priced_at = priced_at - ${shift}, ready_at = ready_at - ${shift}, shipped_at = shipped_at - ${shift}, delivered_at = delivered_at - ${shift}, priority_set_at = priority_set_at - ${shift} WHERE id = ${id}`);
  // Later events get proportionally less of the shift, so time flows forward.
  for (const table of ["order_events", "order_approvals", "artwork_files", "supplier_quotes", "quality_approvals", "priority_changes"]) {
    await db.execute(sql`UPDATE ${sql.identifier(table)} SET created_at = created_at - ${shift} * 0.9 WHERE order_id = ${id}`);
  }
  await db.execute(sql`UPDATE production_steps SET ready_at = ready_at - ${shift} * 0.8, started_at = started_at - ${shift} * 0.7, completed_at = completed_at - ${shift} * 0.6 WHERE order_id = ${id}`);
  await db.execute(sql`UPDATE payments SET created_at = created_at - ${shift} * 0.5, confirmed_at = confirmed_at - ${shift} * 0.5 WHERE order_id = ${id}`);
  await db.execute(sql`UPDATE shipments SET dispatched_at = dispatched_at - ${shift} * 0.3, delivered_at = delivered_at - ${shift} * 0.2 WHERE order_id = ${id}`);
  await db.execute(sql`UPDATE invoices SET issued_at = issued_at - ${shift} * 0.2 WHERE order_id = ${id}`);
  await db.execute(sql`UPDATE lithography_jobs SET sent_at = sent_at - ${shift} * 0.7, received_at = received_at - ${shift} * 0.6 WHERE order_id = ${id}`);
}

