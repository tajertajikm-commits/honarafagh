import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { customers, machines, materials, orders, productionSteps, suppliers, users } from "@/server/db/schema";
import { createCtx, type Ctx } from "@/server/core/context";
import { storeUpload } from "@/server/modules/files/service";
import { approveOrder, rejectOrder, requestInfo, customerReply, setOrderPrice } from "@/server/modules/orders/approval";
import { completeDesign, reviewArtwork, startDesign, uploadArtwork, artworkOf } from "@/server/modules/orders/artwork";
import { createCustomOrder } from "@/server/modules/orders/create";
import { customerOrder } from "@/server/modules/orders/queries";
import { addSupplierQuote, decidePaperSupplier, markPaperReceived, saveLithoJob } from "@/server/modules/offset/service";
import { myWork, stationQueues } from "@/server/modules/queues/service";
import { dispatchOrder, markDelivered } from "@/server/modules/shipping/service";
import { assignMachine, completeStep, decideQuality, setPriority, startStep } from "@/server/modules/workflow/engine";
import type { ReferenceIds } from "@/server/seed/seed-reference";
import { ABDALI, AZAD, GHOLIPOUR, HAJGHASEMI, LABAFI, MANAGER, MEMARIAN, resetTestDb, staffCtx } from "../helpers/db";

let ref: ReferenceIds;
const db = () => getDb();
const staff: Record<string, Ctx> = {};
const PDF = Buffer.from("%PDF-1.4\n%demo artwork\n%%EOF");

async function newCustomer(phone: string, name = "مشتری آزمون"): Promise<{ id: string; ctx: Ctx; code: number }> {
  const [u] = await db().insert(users).values({ phone, fullName: name, kind: "CUSTOMER" }).returning();
  const [c] = await db().insert(customers).values({ phone, fullName: name, userId: u!.id }).returning();
  return { id: c!.id, code: c!.code, ctx: createCtx({ kind: "customer", userId: u!.id, customerId: c!.id, name }) };
}
const orderRow = async (id: string) => (await db().select().from(orders).where(eq(orders.id, id)))[0]!;
const steps = async (orderId: string) => {
  const rows = await db().select().from(productionSteps).where(eq(productionSteps.orderId, orderId));
  return Object.fromEntries(rows.map((s) => [s.key, s]));
};
const stepId = async (orderId: string, key: string) => (await steps(orderId))[key]!.id;

beforeAll(async () => {
  ref = await resetTestDb();
  for (const code of [MANAGER, LABAFI, AZAD, ABDALI, GHOLIPOUR, HAJGHASEMI, MEMARIAN]) staff[code] = await staffCtx(ref, code);
});
afterAll(async () => {
  await closeDb();
});

describe("Digital: customer → approval → selected stations → quality → shipping", () => {
  let orderId = "";
  let customer: Awaited<ReturnType<typeof newCustomer>>;

  it("customer creates a custom Digital order with artwork; it waits for approval", async () => {
    customer = await newCustomer("09350000101");
    const file = await storeUpload(customer.ctx, { data: PDF, filename: "card.pdf", purpose: "ARTWORK" });
    const o = await createCustomOrder(customer.ctx, { productionType: "DIGITAL", title: "کارت دعوت عروسی", quantity: 300, dimensions: "۱۴×۲۰ سانتی‌متر", material: "گلاسه ۳۰۰", colors: "چهاررنگ دو رو", finishing: "سلفون مات و صحافی منگنه", needsDesign: false, artworkFileIds: [file.id], idempotencyKey: "d1" });
    orderId = o.id;
    expect(o.code).toBe(`D-${customer.code}-0001`);
    expect(o.status).toBe("WAITING_APPROVAL");
    expect(o.artworkStatus).toBe("AWAITING_REVIEW");
    const work = await myWork(staff[LABAFI]!);
    expect(work.approvals.map((a) => a.id)).toContain(orderId);
  });

  it("only Digital approvers can approve; Labafi approves and selects the stations", async () => {
    await expect(approveOrder(staff[AZAD]!, orderId, { steps: ["D_PRINT"] })).rejects.toThrow(/مجوز/);
    await expect(approveOrder(staff[GHOLIPOUR]!, orderId, { steps: ["D_PRINT"] })).rejects.toThrow();
    await approveOrder(staff[LABAFI]!, orderId, { steps: ["D_SHEET", "D_PAPER", "D_PRINT", "D_CUT", "D_LAMINATION", "D_BINDING", "D_QUALITY", "D_PACKAGING"], notes: "فایل و مشخصات کامل است" });
    const o = await orderRow(orderId);
    expect(o.status).toBe("APPROVED");
    const s = await steps(orderId);
    expect(Object.keys(s).sort()).toEqual(["D_BINDING", "D_CUT", "D_LAMINATION", "D_PACKAGING", "D_PAPER", "D_PRINT", "D_QUALITY", "D_SHEET", "D_SHIPPING"]);
    expect(s.D_SHEET!.status).toBe("READY");
    expect(s.D_PAPER!.status).toBe("WAITING");
  });

  it("production waits for approved artwork", async () => {
    await expect(startStep(staff[AZAD]!, await stepId(orderId, "D_SHEET"))).rejects.toThrow(/فایل/);
    const queues = await stationQueues(staff[AZAD]!, "DIGITAL");
    expect(queues.find((q) => q.station.key === "D_SHEET")!.blocked).toBeGreaterThanOrEqual(1);
    const [art] = await artworkOf(staff[LABAFI]!, orderId);
    await reviewArtwork(staff[LABAFI]!, art!.artwork.id, { approve: true });
    expect((await orderRow(orderId)).artworkStatus).toBe("APPROVED");
  });

  it("operators run the stations in order; paper is taken from stock", async () => {
    const azad = staff[AZAD]!;
    await startStep(azad, await stepId(orderId, "D_SHEET"));
    expect((await orderRow(orderId)).status).toBe("IN_PRODUCTION");
    const working = (await stationQueues(azad, "DIGITAL")).find((q) => q.station.key === "D_SHEET")!;
    expect(working.working).toBe(1);
    await completeStep(azad, await stepId(orderId, "D_SHEET"));
    // Steps run in plan order: printing cannot start before paper.
    await expect(startStep(azad, await stepId(orderId, "D_PRINT"))).rejects.toThrow(/مراحل قبلی/);
    const [paper] = await db().select().from(materials).where(eq(materials.sku, "P-GL300-SRA3"));
    await expect(completeStep(azad, await stepId(orderId, "D_PAPER"))).rejects.toThrow(/کاغذ/);
    await completeStep(azad, await stepId(orderId, "D_PAPER"), { materialId: paper!.id, quantity: 40 });
    const [after] = await db().select().from(materials).where(eq(materials.id, paper!.id));
    expect(after!.stock).toBe(paper!.stock - 40);
    for (const key of ["D_PRINT", "D_CUT", "D_LAMINATION", "D_BINDING"]) await completeStep(azad, await stepId(orderId, key));
    expect((await steps(orderId)).D_QUALITY!.status).toBe("READY");
  });

  it("only Labafi approves Digital quality; a rejection sends work back", async () => {
    const qc = await stepId(orderId, "D_QUALITY");
    await expect(decideQuality(staff[AZAD]!, qc, { approve: true })).rejects.toThrow(/مجوز/);
    await expect(decideQuality(staff[LABAFI]!, qc, { approve: false })).rejects.toThrow(/دلیل/);
    await decideQuality(staff[LABAFI]!, qc, { approve: false, reason: "منگنه‌ها کج است" });
    let s = await steps(orderId);
    expect(s.D_BINDING!.status).toBe("READY");
    expect(s.D_BINDING!.reworkCount).toBe(1);
    expect(s.D_QUALITY!.status).toBe("WAITING");
    await completeStep(staff[AZAD]!, s.D_BINDING!.id, { note: "صحافی دوباره انجام شد" });
    await decideQuality(staff[LABAFI]!, qc, { approve: true, notes: "عالی" });
    s = await steps(orderId);
    expect(s.D_QUALITY!.status).toBe("DONE");
    expect(s.D_PACKAGING!.status).toBe("READY");
  });

  it("Labafi packages and ships; the customer sees six simple stages", async () => {
    await expect(completeStep(staff[AZAD]!, await stepId(orderId, "D_PACKAGING"))).rejects.toThrow(/مجوز/);
    await completeStep(staff[LABAFI]!, await stepId(orderId, "D_PACKAGING"));
    expect((await orderRow(orderId)).status).toBe("READY");
    let view = await customerOrder(customer.ctx, orderId);
    expect(view.status.label).toBe("آماده");
    await dispatchOrder(staff[LABAFI]!, orderId, { method: "COURIER", recipientName: "مشتری آزمون" });
    expect((await orderRow(orderId)).status).toBe("SHIPPING");
    view = await customerOrder(customer.ctx, orderId);
    expect(view.status.label).toBe("در حال ارسال");
    await markDelivered(staff[LABAFI]!, orderId, {});
    view = await customerOrder(customer.ctx, orderId);
    expect(view.order.status).toBe("DELIVERED");
    expect(view.status.label).toBe("ارسال شد");
    // The customer never sees internal stations or quality decisions.
    const text = view.events.map((e) => e.message).join(" | ");
    expect(text).not.toMatch(/شیت|صحافی|کیفیت|منگنه/);
    expect(view.events.map((e) => e.message)).toEqual(expect.arrayContaining(["سفارش تأیید شد", "در حال آماده‌سازی", "آماده", "در حال ارسال", "ارسال شد"]));
  });

  it("an order can use only some stations (Printing → Cutting → Packaging → Shipping)", async () => {
    const c = await newCustomer("09350000102");
    const o = await createCustomOrder(c.ctx, { productionType: "DIGITAL", title: "برچسب محصول", quantity: 500, needsDesign: false, idempotencyKey: "d2" });
    await approveOrder(staff[MANAGER]!, o.id, { steps: ["D_PRINT", "D_CUT", "D_PACKAGING"] });
    expect(Object.keys(await steps(o.id)).sort()).toEqual(["D_CUT", "D_PACKAGING", "D_PRINT", "D_SHIPPING"]);
    await expect(approveOrder(staff[MANAGER]!, o.id, { steps: ["D_PRINT"] })).rejects.toThrow(/انتظار تأیید/);
  });

  it("approvers can reject or ask the customer for information", async () => {
    const c = await newCustomer("09350000103");
    const a = await createCustomOrder(c.ctx, { productionType: "DIGITAL", title: "پوستر", quantity: 10, needsDesign: false, idempotencyKey: "d3" });
    await requestInfo(staff[LABAFI]!, a.id, { notes: "ابعاد دقیق پوستر را بفرمایید" });
    expect((await orderRow(a.id)).status).toBe("NEEDS_INFO");
    expect((await customerOrder(c.ctx, a.id)).status.action).toMatch(/توضیح/);
    await customerReply(c.ctx, a.id, { message: "۵۰ در ۷۰ سانتی‌متر" });
    expect((await orderRow(a.id)).status).toBe("WAITING_APPROVAL");
    await rejectOrder(staff[LABAFI]!, a.id, { reason: "این ابعاد با دستگاه دیجیتال ممکن نیست" });
    const view = await customerOrder(c.ctx, a.id);
    expect(view.status.label).toBe("پذیرفته نشد");
    expect(view.events.at(-1)!.message).toMatch(/ممکن نیست/);
  });
});

describe("Offset: parallel lithography and paper, supplier decision, press, quality gates", () => {
  let orderId = "";
  let customer: Awaited<ReturnType<typeof newCustomer>>;
  const sup = async (name: string) => (await db().select().from(suppliers).where(eq(suppliers.name, name)))[0]!.id;

  it("customer creates an Offset order requesting design; Digital staff cannot approve it", async () => {
    customer = await newCustomer("09350000201", "شرکت نمونه");
    const o = await createCustomOrder(customer.ctx, { productionType: "OFFSET", title: "بروشور معرفی محصولات", quantity: 5000, dimensions: "A4 سه‌لت", material: "گلاسه ۱۳۵", colors: "چهاررنگ", finishing: "سلفون براق، برش", needsDesign: true, idempotencyKey: "o1" });
    orderId = o.id;
    expect(o.code).toMatch(/^O-\d+-0001$/);
    expect(o.artworkStatus).toBe("DESIGN_REQUESTED");
    await expect(approveOrder(staff[LABAFI]!, orderId, { steps: ["O_PRINT"] })).rejects.toThrow(/مجوز/);
  });

  it("Gholipour approves; lithography and paper start in parallel; design goes to Memarian", async () => {
    await approveOrder(staff[GHOLIPOUR]!, orderId, { steps: ["O_LITHO", "O_PAPER", "O_PRINT", "O_CUT", "O_LAMINATION", "O_BINDING", "O_PACKAGING", "O_SHIPPING"] });
    const s = await steps(orderId);
    expect(s.O_PRINT_QUALITY).toBeDefined(); // required gates are always part of the plan
    expect(s.O_FINAL_QUALITY).toBeDefined();
    expect(s.O_LITHO!.status).toBe("READY");
    expect(s.O_PAPER!.status).toBe("READY");
    expect(s.O_PRINT!.status).toBe("WAITING");
    const o = await orderRow(orderId);
    expect(o.designerId).toBe(ref.employees.get(MEMARIAN)!.employeeId);
    expect((await myWork(staff[MEMARIAN]!)).design.map((d) => d.id)).toContain(orderId);
  });

  it("paper: quotes by phone → manager chooses → received", async () => {
    const g = staff[GHOLIPOUR]!;
    await addSupplierQuote(g, orderId, { supplierId: await sup("بازرگانی کاغذ پارس"), price: 48_000_000 });
    expect((await steps(orderId)).O_PAPER!.status).toBe("IN_PROGRESS");
    await addSupplierQuote(g, orderId, { supplierId: await sup("کاغذ آریا"), price: 51_500_000 });
    const cheapest = await addSupplierQuote(g, orderId, { supplierId: await sup("پخش کاغذ سپید"), price: 46_800_000, notes: "تحویل فردا" });
    await expect(markPaperReceived(g, orderId)).rejects.toThrow(/مدیر/);
    await expect(decidePaperSupplier(g, orderId, { quoteId: cheapest.id })).rejects.toThrow(/مجوز/);
    expect((await myWork(staff[MANAGER]!)).paperDecisions.map((p) => p.id)).toContain(orderId);
    await decidePaperSupplier(staff[MANAGER]!, orderId, { quoteId: cheapest.id, notes: "ارزان‌ترین و سریع‌ترین" });
    await markPaperReceived(g, orderId, { note: "۱۲۰ بند رسید" });
    const s = await steps(orderId);
    expect(s.O_PAPER!.status).toBe("DONE");
    expect(s.O_PRINT!.status).toBe("WAITING"); // still waiting for lithography
  });

  it("lithography needs the final design; receiving plates completes it", async () => {
    const litho = await sup("لیتوگرافی نوین");
    await expect(saveLithoJob(staff[GHOLIPOUR]!, orderId, { supplierId: litho, status: "ORDERED" })).rejects.toThrow(/فایل نهایی/);
    const m = staff[MEMARIAN]!;
    await startDesign(m, orderId);
    await expect(completeDesign(m, orderId)).rejects.toThrow(/بارگذاری/);
    const file = await storeUpload(m, { data: PDF, filename: "brochure-final.pdf", purpose: "DESIGN" });
    await uploadArtwork(m, orderId, { fileIds: [file.id] });
    await completeDesign(m, orderId, { note: "طرح نهایی" });
    expect((await orderRow(orderId)).artworkStatus).toBe("DESIGN_COMPLETED");
    await saveLithoJob(staff[GHOLIPOUR]!, orderId, { supplierId: litho, status: "ORDERED", price: 12_000_000, expectedAt: new Date(Date.now() + 86_400_000) });
    expect((await steps(orderId)).O_LITHO!.status).toBe("IN_PROGRESS");
    await saveLithoJob(staff[GHOLIPOUR]!, orderId, { supplierId: litho, status: "RECEIVED" });
    const s = await steps(orderId);
    expect(s.O_LITHO!.status).toBe("DONE");
    expect(s.O_PRINT!.status).toBe("READY");
  });

  it("press assignment, audited priority, printing", async () => {
    const print = await stepId(orderId, "O_PRINT");
    await expect(startStep(staff[HAJGHASEMI]!, print)).rejects.toThrow(/ماشین/);
    const [press] = await db().select().from(machines).where(eq(machines.category, "FOUR_COLOR"));
    const [digital] = await db().select().from(machines).where(eq(machines.category, "DIGITAL"));
    await expect(assignMachine(staff[HAJGHASEMI]!, print, digital!.id)).rejects.toThrow(/افست/);
    await assignMachine(staff[HAJGHASEMI]!, print, press!.id);
    await expect(setPriority(staff[HAJGHASEMI]!, orderId, { isPriority: true, reason: "مشتری فوری خواست" })).rejects.toThrow(/مجوز/);
    await expect(setPriority(staff[LABAFI]!, orderId, { isPriority: true, reason: "مشتری فوری خواست" })).rejects.toThrow(/مجوز/);
    const before = (await orderRow(orderId)).total;
    await setPriority(staff[GHOLIPOUR]!, orderId, { isPriority: true, reason: "هزینه فوری پرداخت شد", charge: 5_000_000 });
    const o = await orderRow(orderId);
    expect(o.isPriority).toBe(true);
    expect(o.total).toBe(before + 5_500_000); // charge + VAT
    await startStep(staff[HAJGHASEMI]!, print);
    await completeStep(staff[HAJGHASEMI]!, print, { note: "۵۰۰۰ برگ" });
    expect((await steps(orderId)).O_PRINT_QUALITY!.status).toBe("READY");
  });

  it("Hamed approves print quality; post-press; Hamed's final approval gates packaging", async () => {
    const pq = await stepId(orderId, "O_PRINT_QUALITY");
    await expect(decideQuality(staff[GHOLIPOUR]!, pq, { approve: true })).rejects.toThrow(/مجوز/);
    await expect(completeStep(staff[GHOLIPOUR]!, await stepId(orderId, "O_CUT"))).rejects.toThrow(/مراحل قبلی/);
    await decideQuality(staff[MANAGER]!, pq, { approve: true, notes: "رنگ‌ها مطابق نمونه" });
    await completeStep(staff[GHOLIPOUR]!, await stepId(orderId, "O_CUT"));
    await completeStep(staff[HAJGHASEMI]!, await stepId(orderId, "O_LAMINATION"));
    await completeStep(staff[HAJGHASEMI]!, await stepId(orderId, "O_BINDING"));
    const fq = await stepId(orderId, "O_FINAL_QUALITY");
    await expect(completeStep(staff[HAJGHASEMI]!, await stepId(orderId, "O_PACKAGING"))).rejects.toThrow(/مراحل قبلی/);
    await decideQuality(staff[MANAGER]!, fq, { approve: false, reason: "لب برش ناصاف", returnTo: "O_CUT" });
    let s = await steps(orderId);
    expect(s.O_CUT!.status).toBe("READY");
    expect(s.O_LAMINATION!.status).toBe("WAITING");
    for (const key of ["O_CUT", "O_LAMINATION", "O_BINDING"]) await completeStep(key === "O_CUT" ? staff[GHOLIPOUR]! : staff[HAJGHASEMI]!, await stepId(orderId, key));
    await decideQuality(staff[MANAGER]!, fq, { approve: true });
    s = await steps(orderId);
    expect(s.O_PACKAGING!.status).toBe("READY");
  });

  it("Hajghasemi packages, Gholipour hands it over; the customer sees a simple status", async () => {
    await completeStep(staff[HAJGHASEMI]!, await stepId(orderId, "O_PACKAGING"));
    expect((await orderRow(orderId)).status).toBe("READY");
    await expect(dispatchOrder(staff[ABDALI]!, orderId, { method: "PICKUP" })).rejects.toThrow(/مجوز/);
    await dispatchOrder(staff[GHOLIPOUR]!, orderId, { method: "PICKUP", recipientName: "نماینده شرکت" });
    const view = await customerOrder(customer.ctx, orderId);
    expect(view.order.status).toBe("DELIVERED");
    expect(view.status.label).toBe("ارسال شد");
    expect(view.shipment?.method).toBe("تحویل حضوری در چاپخانه");
    expect(view.events.map((e) => e.message).join(" ")).not.toMatch(/لیتوگرافی|زینک|کاغذ|کیفیت|ماشین/);
  });

  it("the accountant prices custom orders; the customer can only pay priced orders", async () => {
    const c = await newCustomer("09350000202");
    const o = await createCustomOrder(c.ctx, { productionType: "OFFSET", title: "سربرگ", quantity: 2000, needsDesign: false, idempotencyKey: "o2" });
    await approveOrder(staff[ABDALI]!, o.id, { steps: ["O_LITHO", "O_PAPER", "O_PRINT", "O_CUT", "O_PACKAGING"], price: { amount: 30_000_000 } });
    const priced = await orderRow(o.id);
    expect(priced.pricedAt).not.toBeNull();
    expect(priced.total).toBe(33_000_000);
    await expect(setOrderPrice(staff[GHOLIPOUR]!, o.id, { amount: 1, discount: 0 })).rejects.toThrow(/مجوز/);
    await setOrderPrice(staff[ABDALI]!, o.id, { amount: 30_000_000, discount: 2_000_000 });
    expect((await orderRow(o.id)).total).toBe(30_800_000);
  });
});

describe("queues and visibility", () => {
  it("operators only see their own process; queue counts are per station", async () => {
    await expect(stationQueues(staff[AZAD]!, "OFFSET")).rejects.toThrow(/مجوز/);
    await expect(stationQueues(staff[GHOLIPOUR]!, "DIGITAL")).rejects.toThrow(/مجوز/);
    const offset = await stationQueues(staff[ABDALI]!, "OFFSET");
    expect(offset.map((q) => q.station.key)).toContain("O_PAPER");
    const printing = (await stationQueues(staff[MANAGER]!, "DIGITAL")).find((q) => q.station.key === "D_PRINT")!;
    expect(printing.waiting + printing.upcoming).toBeGreaterThanOrEqual(1);
  });

  it("customers cannot open each other's orders", async () => {
    const a = await newCustomer("09350000301");
    const b = await newCustomer("09350000302");
    const o = await createCustomOrder(a.ctx, { productionType: "DIGITAL", title: "کارت", quantity: 100, needsDesign: false, idempotencyKey: "v1" });
    await expect(customerOrder(b.ctx, o.id)).rejects.toThrow(/پیدا نشد/);
    const rows = await db().select().from(orders).where(and(eq(orders.customerId, a.id)));
    expect(rows).toHaveLength(1);
  });
});
