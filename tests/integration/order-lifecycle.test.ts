import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import {
  auditLogs,
  customers,
  materialRequirements,
  orderEvents,
  orderItems,
  orders,
  productionJobs,
  productionTasks,
  users,
} from "@/server/db/schema";
import { createCtx, type Ctx } from "@/server/core/context";
import { addArtworkVersion, customerDecision, reviewArtwork, sendProof, storeUpload } from "@/server/modules/files/service";
import { issueRequirement } from "@/server/modules/inventory/service";
import { recordManualPayment } from "@/server/modules/finance/service";
import { cancelOrder, confirmOrder, createManualOrder } from "@/server/modules/orders/service";
import { completeTask, pauseTask, reportIssue, resolveIssue, startTask } from "@/server/modules/production/tasks";
import { recordInspection } from "@/server/modules/qc/service";
import { completeShipment, createShipment, dispatchShipment } from "@/server/modules/delivery/service";
import type { ReferenceIds } from "@/server/seed/seed-reference";
import { ACCOUNTANT, BINDER, CUTTER, DESIGNER, DIGITAL_OP, MANAGER, OFFSET_OP, PREPRESS, QC, resetTestDb, SALES, SHIPPING, staffCtx, WAREHOUSE } from "../helpers/db";

let ref: ReferenceIds;
const db = () => getDb();
const PDF = Buffer.from("%PDF-1.7\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function newCustomer(phone: string, name: string): Promise<{ id: string; ctx: Ctx }> {
  const [u] = await db().insert(users).values({ phone, fullName: name, kind: "CUSTOMER" }).returning();
  const [c] = await db().insert(customers).values({ phone, fullName: name, userId: u!.id }).returning();
  return { id: c!.id, ctx: createCtx({ kind: "customer", userId: u!.id, customerId: c!.id, name }) };
}

async function tasksOf(orderId: string) {
  const rows = await db().select().from(productionTasks).where(eq(productionTasks.orderId, orderId)).orderBy(asc(productionTasks.sortOrder), asc(productionTasks.attempt));
  const current = new Map<string, (typeof rows)[number]>();
  for (const t of rows) current.set(t.stepKey, t);
  return { all: rows, current };
}
const orderRow = async (id: string) => (await db().select().from(orders).where(eq(orders.id, id)))[0]!;

beforeAll(async () => {
  ref = await resetTestDb();
});
afterAll(async () => {
  await closeDb();
});

describe("real-world scenario: 100 notebooks with design service", () => {
  let orderId = "";
  let itemId = "";
  let customer: { id: string; ctx: Ctx };

  it("sales registers the order with a computed price snapshot", async () => {
    customer = await newCustomer("09350000001", "شرکت نمونه");
    const sales = await staffCtx(ref, SALES);
    const order = await createManualOrder(sales, {
      customerId: customer.id,
      items: [{ productId: ref.products.get("notebook")!, quantity: 100, selections: { pages: 100, binding: "wire", cover_lamination: "matte", design: "service" } }],
      deliveryMethodId: ref.deliveryMethods.get("COURIER")!,
      address: { province: "تهران", city: "تهران", line: "خیابان آزادی، پلاک ۱", recipientName: "خانم نمونه", recipientPhone: "09350000001" },
    });
    orderId = order.id;
    const o = await orderRow(orderId);
    const [item] = await db().select().from(orderItems).where(eq(orderItems.orderId, orderId));
    itemId = item!.id;
    expect(o.status).toBe("PENDING_REVIEW");
    expect(o.fileStatus).toBe("IN_DESIGN");
    expect(item!.needsDesign).toBe(true);
    expect(item!.priceSnapshot!.method).toBe("DIGITAL"); // cheapest for 100
    expect(o.total).toBe(o.subtotal + o.shippingAmount + o.vatAmount);
    expect(o.vatAmount).toBe(Math.round((o.subtotal + o.shippingAmount) * 0.1));
  });

  it("confirmation reserves materials, opens procurement for shortages and releases the workflow", async () => {
    await confirmOrder(await staffCtx(ref, SALES), orderId);
    const o = await orderRow(orderId);
    expect(o.status).toBe("CONFIRMED");
    expect(o.dueDate).toBeTruthy();
    const reqs = await db().select().from(materialRequirements).where(eq(materialRequirements.orderItemId, itemId));
    expect(reqs.map((r) => r.purpose).sort()).toEqual(expect.arrayContaining(["PAPER", "OPERATION"]));
    const { current } = await tasksOf(orderId);
    // Digital workflow with design: no plates, no pre-cutting
    expect([...current.keys()]).toEqual(expect.arrayContaining(["DESIGN", "FILE_APPROVAL", "PREPRESS", "PAPER", "PAYMENT", "PRINTING", "LAMINATION", "CUTTING", "BINDING", "FINAL_QC", "PACKAGING"]));
    expect(current.has("PLATE_MAKING")).toBe(false);
    // Parallel start: design and the material gate are both actionable immediately
    expect(current.get("DESIGN")!.status).toBe("READY");
    expect(current.get("PAPER")!.status).toBe("COMPLETED"); // paper was in stock → gate passed
    expect(current.get("PAYMENT")!.status).toBe("READY"); // nothing paid yet → gate waits
    expect(current.get("PRINTING")!.status).toBe("PENDING");
    // Independent state domains
    expect(o.paymentStatus).toBe("UNPAID");
    expect(o.procurementStatus).toBe("RESERVED");
    expect(o.productionStatus).toBe("WAITING");
  });

  it("design → proof → customer requests changes → redesign → approval passes the file gate", async () => {
    const designer = await staffCtx(ref, DESIGNER);
    let { current } = await tasksOf(orderId);
    await startTask(designer, current.get("DESIGN")!.id);
    const f1 = await storeUpload(designer, { data: PDF, filename: "design-v1.pdf", purpose: "ARTWORK" });
    const v1 = await addArtworkVersion(designer, itemId, { fileId: f1.id, stage: "DESIGNER" });
    await sendProof(designer, v1.id);
    expect((await orderRow(orderId)).fileStatus).toBe("AWAITING_CUSTOMER_APPROVAL");
    ({ current } = await tasksOf(orderId));
    expect(current.get("DESIGN")!.status).toBe("COMPLETED");

    await expect(customerDecision(customer.ctx, v1.id, { approve: false })).rejects.toThrow(/تغییرات/);
    await customerDecision(customer.ctx, v1.id, { approve: false, comment: "لوگو بزرگ‌تر شود" });
    ({ current } = await tasksOf(orderId));
    expect(current.get("DESIGN")!.attempt).toBe(2);
    expect(current.get("DESIGN")!.status).toBe("READY");

    await startTask(designer, current.get("DESIGN")!.id);
    const f2 = await storeUpload(designer, { data: PDF, filename: "design-v2.pdf", purpose: "ARTWORK" });
    const v2 = await addArtworkVersion(designer, itemId, { fileId: f2.id, stage: "DESIGNER" });
    await sendProof(designer, v2.id);
    await customerDecision(customer.ctx, v2.id, { approve: true });

    const o = await orderRow(orderId);
    expect(o.fileStatus).toBe("APPROVED");
    ({ current } = await tasksOf(orderId));
    expect(current.get("FILE_APPROVAL")!.status).toBe("COMPLETED");
    expect(current.get("PREPRESS")!.status).toBe("READY");
  });

  it("another customer cannot touch this order's artwork", async () => {
    const other = await newCustomer("09350000099", "دیگری");
    const [v] = await db().query.artworkVersions.findMany({ where: (a, { eq: e }) => e(a.orderItemId, itemId) });
    await expect(customerDecision(other.ctx, v!.id, { approve: true })).rejects.toThrow();
  });

  it("payment gate holds printing until the deposit arrives", async () => {
    const prepress = await staffCtx(ref, PREPRESS);
    let { current } = await tasksOf(orderId);
    await startTask(prepress, current.get("PREPRESS")!.id);
    await completeTask(prepress, current.get("PREPRESS")!.id);
    ({ current } = await tasksOf(orderId));
    expect(current.get("PRINTING")!.status).toBe("PENDING");

    const acc = await staffCtx(ref, ACCOUNTANT);
    const o = await orderRow(orderId);
    await recordManualPayment(acc, orderId, { method: "POS", amount: Math.ceil(o.total / 2), idempotencyKey: "dep-1" });
    // Duplicate submission is rejected
    await expect(recordManualPayment(acc, orderId, { method: "POS", amount: Math.ceil(o.total / 2), idempotencyKey: "dep-1" })).rejects.toThrow(/قبلاً/);
    ({ current } = await tasksOf(orderId));
    expect(current.get("PAYMENT")!.status).toBe("COMPLETED");
    expect(current.get("PRINTING")!.status).toBe("READY");
    expect((await orderRow(orderId)).paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("operators only act on their own step types", async () => {
    const { current } = await tasksOf(orderId);
    await expect(startTask(await staffCtx(ref, OFFSET_OP), current.get("PRINTING")!.id)).rejects.toThrow(/حوزه کاری/);
    await expect(startTask(await staffCtx(ref, WAREHOUSE), current.get("PRINTING")!.id)).rejects.toThrow();
  });

  it("digital operator prints: start, pause, issue/block, resume, complete with consumption and waste", async () => {
    const op = await staffCtx(ref, DIGITAL_OP);
    const wh = await staffCtx(ref, WAREHOUSE);
    let { current } = await tasksOf(orderId);
    const print = current.get("PRINTING")!;
    // Warehouse issues the paper to the floor
    const paperReqs = await db().select().from(materialRequirements).where(and(eq(materialRequirements.orderItemId, itemId), eq(materialRequirements.purpose, "PAPER")));
    for (const r of paperReqs) await issueRequirement(wh, r.id, r.quantityRequired);

    await startTask(op, print.id, { machineId: ref.machines.get("DIG-01")! });
    await pauseTask(op, print.id, "ناهار");
    await startTask(op, print.id); // resume
    const issue = await reportIssue(op, print.id, { type: "MACHINE_BREAKDOWN", description: "گیر کاغذ", block: true });
    ({ current } = await tasksOf(orderId));
    expect(current.get("PRINTING")!.status).toBe("BLOCKED");
    expect((await orderRow(orderId)).productionStatus).toBe("BLOCKED");
    await resolveIssue(await staffCtx(ref, MANAGER), issue.id, "رفع شد");
    ({ current } = await tasksOf(orderId));
    expect(current.get("PRINTING")!.status).toBe("PAUSED");
    await startTask(op, print.id);
    await completeTask(op, print.id, {
      consumption: paperReqs.map((r) => ({ requirementId: r.id, consumed: r.quantityRequired - 2, wasted: 2 })),
    });
    const after = await db().select().from(materialRequirements).where(eq(materialRequirements.id, paperReqs[0]!.id));
    expect(after[0]!.quantityWasted).toBe(2);
    expect(after[0]!.status).toBe("COMPLETED");
    const o = await orderRow(orderId);
    expect(o.status).toBe("IN_PROGRESS");
    expect(o.productionStatus).toBe("IN_PROGRESS");
  });

  it("lamination waits for its cool-down before it can start", async () => {
    const { current } = await tasksOf(orderId);
    const lam = current.get("LAMINATION")!;
    expect(lam.status).toBe("READY");
    expect(lam.earliestStartAt!.getTime()).toBeGreaterThan(Date.now());
    await expect(startTask(await staffCtx(ref, CUTTER), lam.id, { machineId: ref.machines.get("LAM-01")! })).rejects.toThrow(/انتظار/);
    // manager may override with force
    await startTask(await staffCtx(ref, MANAGER), lam.id, { machineId: ref.machines.get("LAM-01")!, force: true });
    await completeTask(await staffCtx(ref, MANAGER), lam.id);
  });

  it("final QC rejects → rework path reopens → second QC passes", async () => {
    const cutter = await staffCtx(ref, CUTTER);
    const binder = await staffCtx(ref, BINDER);
    let { current } = await tasksOf(orderId);
    await startTask(cutter, current.get("CUTTING")!.id, { machineId: ref.machines.get("GUI-01")! });
    await completeTask(cutter, current.get("CUTTING")!.id);
    ({ current } = await tasksOf(orderId));
    await startTask(binder, current.get("BINDING")!.id, { machineId: ref.machines.get("BND-01")! });
    await completeTask(binder, current.get("BINDING")!.id);

    const qc = await staffCtx(ref, QC);
    ({ current } = await tasksOf(orderId));
    const finalQc = current.get("FINAL_QC")!;
    await expect(recordInspection(qc, finalQc.id, { result: "FAILED", quantityChecked: 100, quantityRejected: 8, checklist: [], defects: [] })).rejects.toThrow(/دوباره‌کاری/);
    await recordInspection(qc, finalQc.id, {
      result: "FAILED",
      quantityChecked: 100,
      quantityRejected: 8,
      checklist: [{ item: "کیفیت صحافی", passed: false }],
      defects: [{ defectCode: "BINDING", severity: "MAJOR", quantity: 8 }],
      reworkTargetStepKey: "BINDING",
    });
    ({ current } = await tasksOf(orderId));
    expect(current.get("BINDING")!.attempt).toBe(2);
    expect(current.get("BINDING")!.quantityPlanned).toBe(8);
    expect(current.get("FINAL_QC")!.attempt).toBe(2);
    expect(current.get("PACKAGING")!.status).toBe("PENDING");
    expect((await orderRow(orderId)).qcStatus).toBe("IN_REWORK");

    await startTask(binder, current.get("BINDING")!.id, { machineId: ref.machines.get("BND-01")! });
    await completeTask(binder, current.get("BINDING")!.id);
    ({ current } = await tasksOf(orderId));
    await recordInspection(qc, current.get("FINAL_QC")!.id, { result: "PASSED", quantityChecked: 100, quantityRejected: 0, checklist: [], defects: [] });
    expect((await orderRow(orderId)).qcStatus).toBe("PASSED");
  });

  it("packaging completes production → order READY", async () => {
    const pack = await staffCtx(ref, BINDER);
    const { current } = await tasksOf(orderId);
    await startTask(pack, current.get("PACKAGING")!.id);
    await completeTask(pack, current.get("PACKAGING")!.id);
    const o = await orderRow(orderId);
    expect(o.productionStatus).toBe("COMPLETED");
    expect(o.status).toBe("READY");
    expect(o.deliveryStatus).toBe("READY");
    const [job] = await db().select().from(productionJobs).where(eq(productionJobs.orderId, orderId));
    expect(job!.status).toBe("COMPLETED");
  });

  it("blocks handover until settled, then partial and full delivery complete the order", async () => {
    const ship = await staffCtx(ref, SHIPPING);
    const courier = ref.deliveryMethods.get("COURIER")!;
    // Goods do not leave while a balance is open (no override, no credit line).
    await expect(createShipment(ship, orderId, { methodId: courier, items: [{ orderItemId: itemId, quantity: 60 }] })).rejects.toThrow(/مانده/);

    const acc = await staffCtx(ref, ACCOUNTANT);
    let o = await orderRow(orderId);
    await recordManualPayment(acc, orderId, { method: "BANK_TRANSFER", amount: o.total - o.paidAmount, reference: "123456", idempotencyKey: "settle" });
    o = await orderRow(orderId);
    expect(o.paymentStatus).toBe("PAID");
    expect(o.status).toBe("READY"); // paid but not delivered

    const s1 = await createShipment(ship, orderId, { methodId: courier, items: [{ orderItemId: itemId, quantity: 60 }], assigneeId: ref.employees.get(SHIPPING)!.employeeId });
    await expect(createShipment(ship, orderId, { methodId: courier, items: [{ orderItemId: itemId, quantity: 50 }] })).rejects.toThrow(/حداکثر/);
    await dispatchShipment(ship, s1.id);
    await completeShipment(ship, s1.id, { recipientName: "خانم نمونه" });
    expect((await orderRow(orderId)).deliveryStatus).toBe("PARTIALLY_DELIVERED");
    expect((await orderRow(orderId)).status).toBe("READY");

    const s2 = await createShipment(ship, orderId, { methodId: courier, assigneeId: ref.employees.get(SHIPPING)!.employeeId });
    await dispatchShipment(ship, s2.id);
    await completeShipment(ship, s2.id, { recipientName: "خانم نمونه" });
    o = await orderRow(orderId);
    expect(o.deliveryStatus).toBe("DELIVERED");
    expect(o.status).toBe("COMPLETED");
  });

  it("left a complete, customer-safe timeline and audit trail", async () => {
    const events = await db().select().from(orderEvents).where(eq(orderEvents.orderId, orderId));
    const visible = events.filter((e) => e.visibleToCustomer).map((e) => e.type);
    expect(visible).toEqual(expect.arrayContaining(["PLACED", "CONFIRMED", "PROOF_SENT", "ARTWORK_APPROVED", "PAYMENT_RECEIVED", "DISPATCHED", "DELIVERED"]));
    expect(events.filter((e) => e.visibleToCustomer).some((e) => /cost|بهای تمام/i.test(e.message ?? ""))).toBe(false);
    const audits = await db().select().from(auditLogs).where(eq(auditLogs.entityType, "payment"));
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });
});

describe("offset order (flowchart workflow)", () => {
  it("runs the parallel prepress / paper / plate branches and joins before printing", async () => {
    const cust = await newCustomer("09350000002", "افست");
    const sales = await staffCtx(ref, SALES);
    const order = await createManualOrder(sales, { customerId: cust.id, items: [{ productId: ref.products.get("flyer")!, quantity: 5000, selections: { size: "a5", sides: "4-4" } }], confirm: true });
    const [item] = await db().select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(item!.productionMethod).toBe("OFFSET");
    let { current } = await tasksOf(order.id);
    expect(current.get("PAPER")!.status).toBe("COMPLETED");
    expect(current.get("PLATE_STOCK")!.status).toBe("COMPLETED");
    expect(current.get("PAPER_CUTTING")!.status).toBe("READY");
    expect(current.get("PLATE_MAKING")!.status).toBe("PENDING"); // waits on prepress (file) + payment
    expect(current.get("PLATE_MAKING")!.dependsOn.sort()).toEqual(["PAYMENT", "PLATE_STOCK", "PREPRESS"]);
    expect(current.get("PRINTING")!.dependsOn.sort()).toEqual(["PAPER_CUTTING", "PLATE_MAKING"]);

    // Customer file → prepress approves directly
    const f = await storeUpload(cust.ctx, { data: PDF, filename: "flyer.pdf", purpose: "ARTWORK" });
    const v = await addArtworkVersion(cust.ctx, item!.id, { fileId: f.id, stage: "CUSTOMER_ORIGINAL" });
    await reviewArtwork(await staffCtx(ref, PREPRESS), v.id, { decision: "APPROVE" });
    ({ current } = await tasksOf(order.id));
    expect(current.get("PREPRESS")!.status).toBe("READY");

    // Manager waives the deposit (audited)
    const { setDepositOverride } = await import("@/server/modules/orders/service");
    await setDepositOverride(await staffCtx(ref, MANAGER), order.id, { override: true, reason: "مشتری معتبر" });
    ({ current } = await tasksOf(order.id));
    expect(current.get("PAYMENT")!.status).toBe("COMPLETED");
  });

  it("requires override to cancel once production has started", async () => {
    const cust = await newCustomer("09350000003", "لغو");
    const sales = await staffCtx(ref, SALES);
    const order = await createManualOrder(sales, { customerId: cust.id, items: [{ productId: ref.products.get("flyer")!, quantity: 5000 }], confirm: true });
    const { current } = await tasksOf(order.id);
    const cutter = await staffCtx(ref, CUTTER);
    await startTask(cutter, current.get("PAPER_CUTTING")!.id, { machineId: ref.machines.get("GUI-01")! });
    await expect(cancelOrder(sales, order.id, "انصراف مشتری")).rejects.toThrow();
    const res = await cancelOrder(await staffCtx(ref, MANAGER), order.id, "انصراف مشتری");
    expect(res.productionStarted).toBe(true);
    const o = await orderRow(order.id);
    expect(o.status).toBe("CANCELLED");
    const reqs = await db().select().from(materialRequirements).where(eq(materialRequirements.orderId, order.id));
    expect(reqs.every((r) => r.status === "RELEASED" && r.quantityReserved === 0)).toBe(true);
    const tasks = await tasksOf(order.id);
    expect([...tasks.current.values()].every((t) => ["CANCELLED", "COMPLETED"].includes(t.status))).toBe(true);
  });

  it("a customer can cancel only their own unpaid pending order", async () => {
    const a = await newCustomer("09350000004", "الف");
    const b = await newCustomer("09350000005", "ب");
    const order = await createManualOrder(await staffCtx(ref, SALES), { customerId: a.id, items: [{ productId: ref.products.get("sticker")!, quantity: 100 }] });
    await expect(cancelOrder(b.ctx, order.id, "x")).rejects.toThrow(/پیدا نشد/);
    await cancelOrder(a.ctx, order.id, "اشتباه ثبت شد");
    expect((await orderRow(order.id)).status).toBe("CANCELLED");
  });
});
