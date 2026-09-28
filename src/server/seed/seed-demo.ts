import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { loadStaffActor } from "@/server/auth/sessions";
import { createCtx, type Ctx } from "@/server/core/context";
import { completeShipment, createShipment, dispatchShipment } from "@/server/modules/delivery/service";
import { addArtworkVersion, reviewArtwork, sendProof, storeUpload } from "@/server/modules/files/service";
import { recordManualPayment } from "@/server/modules/finance/service";
import { issueRequirement } from "@/server/modules/inventory/service";
import { confirmOrder, createManualOrder } from "@/server/modules/orders/service";
import { createPurchaseOrder } from "@/server/modules/procurement/service";
import { completeTask, pauseTask, reportIssue, startTask } from "@/server/modules/production/tasks";
import { recordInspection } from "@/server/modules/qc/service";
import { createInquiry, createQuote, sendQuote } from "@/server/modules/quotes/service";
import { scheduleMaintenance } from "@/server/modules/machines/service";
import type { Selections } from "@/server/modules/pricing/types";
import type { ReferenceIds } from "./seed-reference";

const PDF = Buffer.from("%PDF-1.4\n% Honar Afagh demo artwork\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

export const DEMO_CUSTOMERS = [
  { phone: "09121111111", fullName: "نیلوفر کاظمی", type: "INDIVIDUAL" as const, companyName: null },
  { phone: "09122222222", fullName: "آرش بهرامی", type: "COMPANY" as const, companyName: "کافه رستوران سپید" },
  { phone: "09123333333", fullName: "مریم فرهادی", type: "COMPANY" as const, companyName: "آموزشگاه زبان پویا" },
  { phone: "09124444444", fullName: "حمید صالحی", type: "COMPANY" as const, companyName: "داروخانه دکتر صالحی" },
  { phone: "09125555555", fullName: "سپیده عطایی", type: "INDIVIDUAL" as const, companyName: null },
  { phone: "09126666666", fullName: "شرکت فناوران ماهان", type: "COMPANY" as const, companyName: "فناوران ماهان" },
];

export async function seedDemo(db: Database, ref: ReferenceIds) {
  const staff = async (code: string): Promise<Ctx> => {
    const a = await loadStaffActor(db, ref.employees.get(code)!.userId);
    return { ...createCtx(a!), db };
  };
  const mgr = await staff("E001");
  const sales = await staff("E002");
  const acc = await staff("E003");
  const wh = await staff("E004");
  const designer = await staff("E005");
  const prepress = await staff("E006");
  const offsetOp = await staff("E007");
  const digitalOp = await staff("E008");
  const cutter = await staff("E009");
  const binder = await staff("E010");
  const qc = await staff("E011");
  const shipper = await staff("E012");

  // Customers (with login identities so OTP login lands on their history)
  const customers: { id: string; userId: string; ctx: Ctx }[] = [];
  for (const c of DEMO_CUSTOMERS) {
    const [u] = await db.insert(t.users).values({ phone: c.phone, fullName: c.fullName, kind: "CUSTOMER" }).returning();
    const [row] = await db.insert(t.customers).values({ phone: c.phone, fullName: c.fullName, type: c.type, companyName: c.companyName, userId: u!.id, discountPct: c.type === "COMPANY" ? 5 : 0 }).returning();
    await db.insert(t.addresses).values({ customerId: row!.id, title: "محل کار", province: "تهران", city: "تهران", line: "خیابان ولیعصر، بالاتر از میدان ونک، پلاک ۲۴۰، واحد ۳", postalCode: "1969714511", recipientName: c.fullName, recipientPhone: c.phone, isDefault: true });
    customers.push({ id: row!.id, userId: u!.id, ctx: { ...createCtx({ kind: "customer", userId: u!.id, customerId: row!.id, name: c.fullName }), db } });
  }
  const courier = ref.deliveryMethods.get("COURIER")!;
  const pickup = ref.deliveryMethods.get("PICKUP")!;
  const addr = (i: number) => ({ province: "تهران", city: "تهران", line: "خیابان ولیعصر، پلاک ۲۴۰", recipientName: DEMO_CUSTOMERS[i]!.fullName, recipientPhone: DEMO_CUSTOMERS[i]!.phone });

  const order = async (ci: number, slug: string, quantity: number, selections: Selections, opts: { priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT"; delivery?: string; confirm?: boolean } = {}) => {
    const o = await createManualOrder(sales, {
      customerId: customers[ci]!.id,
      items: [{ productId: ref.products.get(slug)!, quantity, selections }],
      priority: opts.priority,
      deliveryMethodId: opts.delivery ?? courier,
      address: opts.delivery === pickup ? null : addr(ci),
      source: "PHONE",
    });
    const [item] = await db.select().from(t.orderItems).where(eq(t.orderItems.orderId, o.id));
    return { id: o.id, itemId: item!.id, total: o.total };
  };
  const tasks = async (orderId: string) => {
    const rows = await db.select().from(t.productionTasks).where(eq(t.productionTasks.orderId, orderId)).orderBy(asc(t.productionTasks.attempt));
    return new Map(rows.map((r) => [r.stepKey, r]));
  };
  const uploadAndApprove = async (ci: number, itemId: string) => {
    const f = await storeUpload(customers[ci]!.ctx, { data: PDF, filename: "artwork.pdf", purpose: "ARTWORK" });
    const v = await addArtworkVersion(customers[ci]!.ctx, itemId, { fileId: f.id, stage: "CUSTOMER_ORIGINAL" });
    await reviewArtwork(prepress, v.id, { decision: "APPROVE", note: "فایل استاندارد است" });
  };
  const pay = (orderId: string, amount: number, method: "POS" | "CASH" | "BANK_TRANSFER", key: string) => recordManualPayment(acc, orderId, { method, amount, reference: method === "BANK_TRANSFER" ? "7731" + key.length : null, idempotencyKey: key });
  /**
   * Seeded history is produced in seconds; give each completed task a
   * realistic, sequential duration (estimate × 0.85–1.3) so production,
   * machine and labour reports have meaningful numbers.
   */
  const respaceHistory = async (orderId: string, seedNo: number) => {
    const [o] = await db.select({ placedAt: t.orders.placedAt }).from(t.orders).where(eq(t.orders.id, orderId));
    const list = await db.select().from(t.productionTasks).where(and(eq(t.productionTasks.orderId, orderId), eq(t.productionTasks.status, "COMPLETED"))).orderBy(asc(t.productionTasks.completedAt));
    let cursor = new Date(o!.placedAt.getTime() + 2 * 3_600_000);
    for (const [k, task] of list.entries()) {
      const factor = 0.85 + (((seedNo * 7 + k * 13) % 10) / 10) * 0.45;
      const minutes = task.gate ? 0 : Math.max(5, Math.round((task.estimatedMinutes || 20) * factor));
      const start = cursor;
      const end = new Date(start.getTime() + minutes * 60_000);
      await db.update(t.productionTasks).set({ startedAt: task.gate ? null : start, completedAt: end }).where(eq(t.productionTasks.id, task.id));
      await db.update(t.taskTimeLogs).set({ startedAt: start, endedAt: end }).where(eq(t.taskTimeLogs.taskId, task.id));
      cursor = new Date(end.getTime() + (task.gate ? 0 : 20 * 60_000));
    }
    await db.execute(sql`UPDATE orders SET ready_at = ${cursor}, completed_at = ${cursor}::timestamptz + interval '1 day' WHERE id = ${orderId}`);
  };

  const run = async (ctx: Ctx, taskId: string | undefined, machine?: string, consumption?: { requirementId: string; consumed: number; wasted: number }[]) => {
    if (!taskId) return;
    // Seeding compresses time: waits such as ink drying are overridden by the manager.
    const [task] = await db.select().from(t.productionTasks).where(eq(t.productionTasks.id, taskId));
    const actor = task?.earliestStartAt && task.earliestStartAt > new Date() ? mgr : ctx;
    await startTask(actor, taskId, { machineId: machine ? ref.machines.get(machine) : undefined, force: true });
    await completeTask(actor, taskId, { consumption });
  };
  const issuePaper = async (itemId: string) => {
    const reqs = await db.select().from(t.materialRequirements).where(eq(t.materialRequirements.orderItemId, itemId));
    for (const r of reqs) if (r.quantityReserved > 0) await issueRequirement(wh, r.id, r.quantityReserved);
    return reqs;
  };
  const finishFlow = async (orderId: string, itemId: string, method: "OFFSET" | "DIGITAL") => {
    let ts = await tasks(orderId);
    const reqs = await issuePaper(itemId);
    const paperReqs = reqs.filter((r) => r.purpose === "PAPER" && r.quantityReserved > 0);
    await run(prepress, ts.get("PREPRESS")?.id);
    if (method === "OFFSET") {
      ts = await tasks(orderId);
      await run(prepress, ts.get("PLATE_MAKING")?.id, "CTP-01");
      await run(cutter, ts.get("PAPER_CUTTING")?.id, "GUI-01");
      ts = await tasks(orderId);
      await run(offsetOp, ts.get("PRINTING")?.id, "OFF-01", paperReqs.map((r) => ({ requirementId: r.id, consumed: Math.floor(r.quantityReserved * 0.97), wasted: r.quantityReserved - Math.floor(r.quantityReserved * 0.97) })));
      ts = await tasks(orderId);
      await recordInspection(qc, ts.get("PRINT_QC")!.id, { result: "PASSED", quantityChecked: 50, quantityRejected: 0, checklist: [], defects: [] });
    } else {
      ts = await tasks(orderId);
      await run(digitalOp, ts.get("PRINTING")?.id, "DIG-02", paperReqs.map((r) => ({ requirementId: r.id, consumed: r.quantityReserved - 3, wasted: 3 })));
    }
    for (const [key, ctx, machine] of [
      ["LAMINATION", cutter, "LAM-01"],
      ["CUTTING", cutter, "GUI-01"],
      ["UV", cutter, "UV-01"],
      ["PLOTTER", digitalOp, "PLT-01"],
      ["CORNERS", cutter, undefined],
      ["BINDING", binder, "BND-01"],
    ] as const) {
      ts = await tasks(orderId);
      const task = ts.get(key);
      if (task && task.status === "READY") await run(ctx, task.id, machine);
    }
    ts = await tasks(orderId);
    await recordInspection(qc, ts.get("FINAL_QC")!.id, { result: "PASSED", quantityChecked: 100, quantityRejected: 0, checklist: [], defects: [] });
    ts = await tasks(orderId);
    await run(binder, ts.get("PACKAGING")?.id);
  };

  // ── Historical completed orders (backdated) for reports ───────────────────
  const history: [number, string, number, Selections][] = [
    [0, "business-card", 500, { lamination: "matte" }],
    [1, "flyer", 3000, { size: "a5", sides: "4-4" }],
    [2, "notebook", 150, { pages: 80 }],
    [3, "sticker", 1000, { finish: "gloss" }],
    [4, "business-card", 1000, { paper: "kt300", corners: true }],
    [5, "letterhead", 2000, {}],
    [1, "sticker", 500, {}],
    [2, "flyer", 1000, { size: "a4" }],
    [5, "catalog", 300, { pages: 16 }],
  ];
  for (const [i, [ci, slug, qty, sel]] of history.entries()) {
    const o = await order(ci, slug, qty, sel, { delivery: i % 3 === 0 ? pickup : courier });
    await confirmOrder(sales, o.id);
    await uploadAndApprove(ci, o.itemId);
    await pay(o.id, o.total, i % 2 ? "POS" : "BANK_TRANSFER", `hist-${i}`);
    const [item] = await db.select().from(t.orderItems).where(eq(t.orderItems.id, o.itemId));
    await finishFlow(o.id, o.itemId, item!.productionMethod as "OFFSET" | "DIGITAL");
    const s = await createShipment(shipper, o.id, { methodId: i % 3 === 0 ? pickup : courier, assigneeId: ref.employees.get("E012")!.employeeId });
    if (i % 3 !== 0) await dispatchShipment(shipper, s.id);
    await completeShipment(shipper, s.id, { recipientName: DEMO_CUSTOMERS[ci]!.fullName });
    const daysAgo = 3 + i * 3;
    const shift = sql`make_interval(days => ${daysAgo})`;
    await db.execute(sql`UPDATE orders SET placed_at = placed_at - ${shift}, confirmed_at = confirmed_at - ${shift}, ready_at = ready_at - ${shift}, completed_at = completed_at - ${shift} + interval '2 days', created_at = created_at - ${shift}, due_date = due_date - ${shift} + interval '2 days' WHERE id = ${o.id}`);
    await db.execute(sql`UPDATE payments SET confirmed_at = confirmed_at - ${shift} + interval '1 day', created_at = created_at - ${shift} WHERE order_id = ${o.id}`);
    await db.execute(sql`UPDATE production_tasks SET started_at = started_at - ${shift}, completed_at = completed_at - ${shift}, ready_at = ready_at - ${shift} WHERE order_id = ${o.id}`);
    await db.execute(sql`UPDATE order_events SET created_at = created_at - ${shift} WHERE order_id = ${o.id}`);
    await db.execute(sql`UPDATE qc_inspections SET created_at = created_at - ${shift} WHERE job_id IN (SELECT id FROM production_jobs WHERE order_id = ${o.id})`);
    await respaceHistory(o.id, i);
  }

  // ── Live orders in every interesting state ────────────────────────────────

  // A. The notebook scenario: 300 notebooks, design service, paper shortage → procurement in parallel
  const a = await order(2, "notebook", 400, { pages: 120, inner_paper: "th70", binding: "wire", cover_lamination: "matte", design: "service" }, { priority: "HIGH" });
  await confirmOrder(sales, a.id);
  await pay(a.id, Math.ceil(a.total / 2), "BANK_TRANSFER", "a-dep");
  const aTasks = await tasks(a.id);
  await startTask(designer, aTasks.get("DESIGN")!.id);
  await pauseTask(designer, aTasks.get("DESIGN")!.id, "در انتظار ارسال لوگوی باکیفیت از مشتری");
  // Procurement orders the missing paper
  const shortages = await db.select().from(t.materialRequests).where(and(eq(t.materialRequests.orderId, a.id), eq(t.materialRequests.status, "OPEN")));
  if (shortages.length) {
    const byMaterial = new Map<string, typeof shortages>();
    for (const s of shortages) byMaterial.set(s.materialId, [...(byMaterial.get(s.materialId) ?? []), s]);
    for (const [materialId, reqs] of byMaterial) {
      const [m] = await db.select().from(t.materials).where(eq(t.materials.id, materialId));
      await createPurchaseOrder(wh.actor.kind === "staff" && wh.actor.permissions.has("procurement.manage") ? wh : mgr, {
        supplierId: m!.defaultSupplierId!,
        submit: true,
        expectedAt: new Date(Date.now() + 2 * 86_400_000),
        lines: [{ materialId, quantity: Math.max(m!.reorderQuantity, Math.ceil(reqs.reduce((s, r) => s + r.quantity, 0))), unitCost: m!.standardCost, materialRequestIds: reqs.map((r) => r.id) }],
      });
    }
  }

  // B. Business cards, paid in full, printing in progress on the digital press
  const b = await order(0, "business-card", 1000, { sides: "4-4", lamination: "matte", spot_uv: true }, { priority: "URGENT" });
  await confirmOrder(sales, b.id);
  await uploadAndApprove(0, b.itemId);
  await pay(b.id, b.total, "POS", "b-full");
  await issuePaper(b.itemId);
  let bt = await tasks(b.id);
  await run(prepress, bt.get("PREPRESS")!.id);

  // C. Offset flyers: printed, print-QC rejected once (rework), now in finishing
  const c = await order(1, "flyer", 5000, { size: "a4", sides: "4-4" }, { priority: "NORMAL" });
  await confirmOrder(sales, c.id);
  await uploadAndApprove(1, c.itemId);
  await pay(c.id, Math.ceil(c.total * 0.6), "BANK_TRANSFER", "c-dep");
  const cReqs = await issuePaper(c.itemId);
  let ct = await tasks(c.id);
  await run(prepress, ct.get("PREPRESS")!.id);
  ct = await tasks(c.id);
  await run(prepress, ct.get("PLATE_MAKING")!.id, "CTP-01");
  await run(cutter, ct.get("PAPER_CUTTING")!.id, "GUI-01");
  ct = await tasks(c.id);
  const paper = cReqs.filter((r) => r.purpose === "PAPER");
  await run(offsetOp, ct.get("PRINTING")!.id, "OFF-01", paper.map((r) => ({ requirementId: r.id, consumed: Math.floor(r.quantityRequired * 0.8), wasted: Math.floor(r.quantityRequired * 0.03) })));
  ct = await tasks(c.id);
  await recordInspection(qc, ct.get("PRINT_QC")!.id, {
    result: "FAILED",
    quantityChecked: 200,
    quantityRejected: 60,
    checklist: [{ item: "تطابق رنگ با پروف تأییدشده", passed: false }],
    defects: [{ defectCode: "COLOR", severity: "MAJOR", quantity: 60, description: "سایان کم‌رنگ" }],
    reworkTargetStepKey: "PRINTING",
    reworkQuantity: 1000,
    notes: "اختلاف رنگ در فرم دوم",
  });
  ct = await tasks(c.id);
  await run(offsetOp, ct.get("PRINTING")!.id, "OFF-01", paper.map((r) => ({ requirementId: r.id, consumed: Math.max(0, Math.floor(r.quantityRequired * 0.15)), wasted: 5 })));
  ct = await tasks(c.id);
  await recordInspection(qc, ct.get("PRINT_QC")!.id, { result: "PASSED", quantityChecked: 200, quantityRejected: 0, checklist: [], defects: [] });

  // D. Catalog: waiting for the customer's file (pending review)
  const d = await order(5, "catalog", 250, { pages: 24, binding: "perfect" });
  void d;

  // E. Stickers: ready for pickup, half paid
  const e = await order(3, "sticker", 500, { size: "s70", finish: "gloss" }, { delivery: pickup });
  await confirmOrder(sales, e.id);
  await uploadAndApprove(3, e.itemId);
  await pay(e.id, Math.ceil(e.total / 2), "CASH", "e-dep");
  await finishFlow(e.id, e.itemId, "DIGITAL");

  // F. Letterheads: out for delivery
  const f = await order(4, "letterhead", 1000, {}, { priority: "LOW" });
  await confirmOrder(sales, f.id);
  await uploadAndApprove(4, f.itemId);
  await pay(f.id, f.total, "BANK_TRANSFER", "f-full");
  const [fItem] = await db.select().from(t.orderItems).where(eq(t.orderItems.id, f.itemId));
  await finishFlow(f.id, f.itemId, fItem!.productionMethod as "OFFSET" | "DIGITAL");
  const fs = await createShipment(shipper, f.id, { methodId: courier, assigneeId: ref.employees.get("E012")!.employeeId, vehicleId: null });
  await dispatchShipment(shipper, fs.id);

  // G. Flyers with a proof waiting for the customer, and a blocked job
  const g = await order(0, "flyer", 800, { size: "a5", design: "service" });
  await confirmOrder(sales, g.id);
  const gt = await tasks(g.id);
  await startTask(designer, gt.get("DESIGN")!.id);
  const gf = await storeUpload(designer, { data: PDF, filename: "flyer-proof.pdf", purpose: "ARTWORK" });
  const gv = await addArtworkVersion(designer, g.itemId, { fileId: gf.id, stage: "DESIGNER", note: "نسخه اول طرح" });
  await sendProof(designer, gv.id, "لطفاً رنگ‌ها و متن را بررسی کنید");

  const h = await order(1, "business-card", 2000, { paper: "kt300", lamination: "gloss" });
  await confirmOrder(sales, h.id);
  await uploadAndApprove(1, h.itemId);
  await pay(h.id, h.total, "POS", "h-full");
  const hTasks = await tasks(h.id);
  await startTask(prepress, hTasks.get("PREPRESS")!.id);
  await reportIssue(prepress, hTasks.get("PREPRESS")!.id, { type: "FILE_PROBLEM", description: "فونت‌های فایل تبدیل به منحنی نشده‌اند", block: true });

  // B is on the press right now (started last: an operator runs one job at a time)
  bt = await tasks(b.id);
  await startTask(digitalOp, bt.get("PRINTING")!.id, { machineId: ref.machines.get("DIG-01") });

  // Web order waiting for payment
  await order(4, "sticker", 250, {}, { delivery: pickup });

  // Quotes & inquiries
  const inquiry = await createInquiry(customers[5]!.ctx, { title: "جعبه بسته‌بندی محصول", description: "۱۰۰۰ عدد جعبه مقوایی با چاپ چهاررنگ و قالب‌برش برای محصولات الکترونیکی", quantity: 1000 });
  void inquiry;
  const q = await createQuote(sales, {
    customerId: customers[2]!.id,
    items: [
      { productId: ref.products.get("catalog")!, quantity: 500, selections: { pages: 32 } },
      { title: "طراحی و صفحه‌آرایی کاتالوگ", quantity: 1, lineSubtotal: 45_000_000 },
    ],
    customerNote: "قیمت شامل طراحی کامل کاتالوگ است.",
  });
  await sendQuote(sales, q.id);

  // Maintenance on the second offset press
  await scheduleMaintenance(mgr, { machineId: ref.machines.get("OFF-02")!, kind: "PREVENTIVE", title: "سرویس دوره‌ای غلتک‌ها", scheduledStart: new Date(Date.now() + 86_400_000), scheduledEnd: new Date(Date.now() + 86_400_000 + 4 * 3_600_000) });

  return { customers: customers.length };
}
