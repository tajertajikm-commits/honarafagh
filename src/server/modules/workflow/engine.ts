import { and, asc, eq, sql } from "drizzle-orm";
import { employeeRoles, employees, machines, materials, orderItems, orders, priorityChanges, productionSteps, qualityApprovals, rolePermissions, shipments, stockMovements, users } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, can, inTx } from "@/server/core/context";
import { forbidden, invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { assertOrderAccess, loadOrder, orderEvent, recalcOrder, worksOnType, type Order } from "@/server/modules/orders/state";
import { customerStatus } from "@/lib/order-status";
import { formatToman } from "@/lib/persian";
import { APPROVE_PERMISSION, normalizePlan, station, STATIONS, type Station } from "./stations";

export type Step = typeof productionSteps.$inferSelect;

/** Orders whose plan is live (queues only show these). */
export const ACTIVE_STATUSES = ["APPROVED", "IN_PRODUCTION", "READY", "SHIPPING"] as const;
const isActive = (o: Pick<Order, "status">) => (ACTIVE_STATUSES as readonly string[]).includes(o.status);

export const artworkReady = (o: Pick<Order, "artworkStatus">) => o.artworkStatus === "APPROVED" || o.artworkStatus === "DESIGN_COMPLETED";

// ── Pure rules (unit-tested) ────────────────────────────────────────────────

/** Steps whose every earlier-phase step is done (they enter their queue). */
export function readySteps<S extends Pick<Step, "key" | "phase" | "status">>(steps: S[]): S[] {
  return steps.filter((s) => s.status === "WAITING" && steps.every((o) => o.phase >= s.phase || o.status === "DONE"));
}

/** The order lifecycle implied by its plan. */
export function statusFromSteps(steps: Pick<Step, "key" | "status">[]): "APPROVED" | "IN_PRODUCTION" | "READY" | "SHIPPING" | "DELIVERED" {
  const ship = steps.find((s) => station(s.key).kind === "SHIPPING");
  if (ship?.status === "DONE") return "DELIVERED";
  if (ship?.status === "IN_PROGRESS") return "SHIPPING";
  const work = steps.filter((s) => s !== ship);
  if (work.length > 0 && work.every((s) => s.status === "DONE")) return "READY";
  if (steps.some((s) => s.status === "IN_PROGRESS" || s.status === "DONE")) return "IN_PRODUCTION";
  return "APPROVED";
}

/** The default step a quality rejection sends work back to: the closest earlier production step. */
export function defaultReturnTarget(plan: Pick<Step, "key" | "phase">[], qualityKey: string): string | null {
  const q = plan.find((s) => s.key === qualityKey);
  if (!q) return null;
  const earlier = plan.filter((s) => s.phase < q.phase && ["WORK", "PRINT", "PAPER_SELECT"].includes(station(s.key).kind));
  return earlier.sort((a, b) => b.phase - a.phase)[0]?.key ?? null;
}

/** Why a READY step cannot be started yet (shown in the queue); null when it can. */
export function blockedReason(step: Pick<Step, "key" | "status" | "machineId">, order: Pick<Order, "artworkStatus">): string | null {
  if (step.status !== "READY") return null;
  const st = station(step.key);
  if (st.needsArtwork && !artworkReady(order)) {
    return order.artworkStatus === "DESIGN_REQUESTED" || order.artworkStatus === "DESIGN_IN_PROGRESS" ? "منتظر طراحی" : "منتظر فایل تأییدشده";
  }
  if (st.kind === "PRINT" && !step.machineId) return "ماشین چاپ تعیین نشده";
  return null;
}

// ── Plan ────────────────────────────────────────────────────────────────────

export async function createPlan(ctx: Ctx, order: Order, selected: readonly string[]) {
  const plan = normalizePlan(order.productionType, selected);
  if (!plan.some((s) => s.kind !== "SHIPPING" && s.kind !== "QUALITY")) throw validation("حداقل یک ایستگاه تولید را انتخاب کنید.");
  await ctx.db.delete(productionSteps).where(eq(productionSteps.orderId, order.id));
  await ctx.db.insert(productionSteps).values(plan.map((s) => ({ orderId: order.id, key: s.key, phase: s.phase, status: "WAITING" as const })));
  return plan;
}

export async function stepsOf(ctx: Ctx, orderId: string): Promise<Step[]> {
  return ctx.db.select().from(productionSteps).where(eq(productionSteps.orderId, orderId)).orderBy(asc(productionSteps.phase), asc(productionSteps.key));
}

/**
 * Moves steps into their queues and keeps the order's lifecycle in step with
 * its plan. Called after every change to a step; idempotent.
 */
export async function refreshOrder(ctx: Ctx, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o || !isActive(o)) return;
  const steps = await stepsOf(ctx, orderId);
  const now = new Date();
  for (const s of readySteps(steps)) {
    await ctx.db.update(productionSteps).set({ status: "READY", readyAt: now }).where(eq(productionSteps.id, s.id));
    s.status = "READY";
    if (station(s.key).kind === "QUALITY") await emit(ctx, "QualityCheckNeeded", { type: "order", id: orderId }, { orderId, stepKey: s.key });
  }
  const next = statusFromSteps(steps);
  if (next === o.status) return;
  const stamps: Partial<Order> = {};
  if (next === "READY") stamps.readyAt = now;
  if (next === "SHIPPING") stamps.shippedAt = now;
  if (next === "DELIVERED") stamps.deliveredAt = now;
  await ctx.db.update(orders).set({ status: next, ...stamps }).where(eq(orders.id, orderId));
  // Customers see the simplified stage, and only when it actually changes.
  const before = customerStatus(o.status);
  const after = customerStatus(next);
  if (before.stage !== after.stage) await orderEvent(ctx, { orderId, domain: "ORDER", type: `STATUS_${next}`, message: after.label, visibleToCustomer: true });
  if (next === "READY") await emit(ctx, "OrderReady", { type: "order", id: orderId }, { orderId });
}

// ── Steps ───────────────────────────────────────────────────────────────────

async function loadStep(ctx: Ctx, stepId: string) {
  const [s] = await ctx.db.select().from(productionSteps).where(eq(productionSteps.id, stepId)).for("update");
  if (!s) throw notFound("مرحله");
  const o = await loadOrder(ctx, s.orderId, { lock: true });
  if (!isActive(o)) throw invalidState("این سفارش در جریان تولید نیست.");
  return { step: s, order: o, st: station(s.key) };
}

function assertStation(ctx: Ctx, st: Station, step?: Step) {
  assertCan(ctx, st.permission);
  if (step) assertAssignee(ctx, step);
}

/** A step the manager handed to someone is theirs (the manager can still act on it). */
export function assertAssignee(ctx: Ctx, step: Pick<Step, "assignedBy" | "assigneeId">) {
  if (!step.assignedBy || !step.assigneeId) return;
  if (ctx.actor.kind === "staff" && (ctx.actor.employeeId === step.assigneeId || can(ctx, "dashboard.view"))) return;
  throw forbidden("این کار توسط مدیر به همکار دیگری سپرده شده است.");
}

const meEmployee = (ctx: Ctx) => (ctx.actor.kind === "staff" ? ctx.actor.employeeId : null);

/** Shared by the special flows (lithography received, paper received, delivered). */
export async function finishStep(ctx: Ctx, step: Step, note?: string | null, data?: Record<string, unknown>) {
  const now = new Date();
  await ctx.db
    .update(productionSteps)
    .set({
      status: "DONE",
      startedAt: step.startedAt ?? now,
      startedBy: step.startedBy ?? actorUserId(ctx),
      assigneeId: step.assigneeId ?? meEmployee(ctx),
      completedAt: now,
      completedBy: actorUserId(ctx),
      note: note ?? step.note,
      data: data ? { ...step.data, ...data } : step.data,
    })
    .where(eq(productionSteps.id, step.id));
  await orderEvent(ctx, { orderId: step.orderId, domain: "PRODUCTION", type: "STEP_DONE", message: `${station(step.key).name} انجام شد${note ? ` — ${note}` : ""}` });
  await refreshOrder(ctx, step.orderId);
}

/** Marks a step as being worked on (shown as "در حال انجام" in its queue). */
export async function markStarted(ctx: Ctx, step: Step) {
  if (step.status === "IN_PROGRESS") return;
  await ctx.db
    .update(productionSteps)
    .set({ status: "IN_PROGRESS", startedAt: new Date(), startedBy: actorUserId(ctx), assigneeId: step.assigneeId ?? meEmployee(ctx) })
    .where(eq(productionSteps.id, step.id));
  await orderEvent(ctx, { orderId: step.orderId, domain: "PRODUCTION", type: "STEP_STARTED", message: `${station(step.key).name} شروع شد` });
  await refreshOrder(ctx, step.orderId);
}

function assertCanStart(step: Step, order: Order, st: Station) {
  if (step.status === "WAITING") throw invalidState("مراحل قبلی این سفارش هنوز تمام نشده است.");
  if (step.status === "DONE") throw invalidState("این مرحله انجام شده است.");
  const reason = blockedReason(step, order);
  if (reason) throw invalidState(`${st.name}: ${reason}.`);
}

export async function startStep(ctx: Ctx, stepId: string) {
  return inTx(ctx, async (tx) => {
    const { step, order, st } = await loadStep(tx, stepId);
    assertStation(tx, st, step);
    if (st.kind !== "WORK" && st.kind !== "PRINT" && st.kind !== "PAPER_SELECT") throw invalidState("این مرحله شروع جداگانه ندارد.");
    assertCanStart(step, order, st);
    await markStarted(tx, step);
  });
}

export interface CompleteInput {
  note?: string | null;
  /** D_PAPER: paper/cardboard taken from stock. */
  materialId?: string | null;
  quantity?: number | null;
  paperNote?: string | null;
}

/** Finishes a station. Starting first is optional: a READY step can be finished directly. */
export async function completeStep(ctx: Ctx, stepId: string, input: CompleteInput = {}) {
  return inTx(ctx, async (tx) => {
    const { step, order, st } = await loadStep(tx, stepId);
    assertStation(tx, st, step);
    if (st.kind !== "WORK" && st.kind !== "PRINT" && st.kind !== "PAPER_SELECT") throw invalidState("این مرحله از مسیر مخصوص خودش تکمیل می‌شود.");
    assertCanStart(step, order, st);
    let data: Record<string, unknown> | undefined;
    if (st.kind === "PAPER_SELECT") {
      if (!input.materialId && !input.paperNote?.trim()) throw validation("کاغذ یا مقوای مصرفی را انتخاب کنید.");
      if (input.materialId) {
        const [m] = await tx.db.select().from(materials).where(eq(materials.id, input.materialId));
        if (!m) throw validation("ماده انتخاب‌شده معتبر نیست.");
        const quantity = input.quantity ?? 0;
        if (quantity < 0) throw validation("تعداد نامعتبر است.");
        if (quantity > m.stock) throw validation(`موجودی «${m.name}» کافی نیست (موجودی: ${new Intl.NumberFormat("fa-IR").format(m.stock)}). ورود کاغذ را در «مواد و انبار» ثبت کنید یا تعداد مصرف را خالی بگذارید.`);
        if (quantity > 0) {
          await tx.db.update(materials).set({ stock: sql`${materials.stock} - ${quantity}` }).where(eq(materials.id, m.id));
          await tx.db.insert(stockMovements).values({ materialId: m.id, delta: -quantity, reason: "CONSUME", orderId: order.id, note: `${order.code} — ${st.name}`, createdBy: actorUserId(tx) });
        }
        data = { materialId: m.id, materialName: m.name, quantity, unit: m.unit };
      } else data = { paperNote: input.paperNote };
    }
    await finishStep(tx, step, input.note ?? null, data);
  });
}

// ── Quality ─────────────────────────────────────────────────────────────────

export async function decideQuality(ctx: Ctx, stepId: string, input: { approve: boolean; notes?: string | null; reason?: string | null; returnTo?: string | null }) {
  return inTx(ctx, async (tx) => {
    const { step, order, st } = await loadStep(tx, stepId);
    if (st.kind !== "QUALITY") throw invalidState("این مرحله تأیید کیفیت نیست.");
    assertStation(tx, st, step);
    if (step.status !== "READY") throw invalidState(step.status === "DONE" ? "کیفیت این مرحله قبلاً تأیید شده است." : "کار هنوز به این مرحله نرسیده است.");
    const plan = await stepsOf(tx, order.id);
    if (input.approve) {
      await tx.db.insert(qualityApprovals).values({ orderId: order.id, stepId, decision: "APPROVED", approverId: actorUserId(tx)!, notes: input.notes ?? null });
      await orderEvent(tx, { orderId: order.id, domain: "QUALITY", type: "QUALITY_APPROVED", message: `${st.name}: تأیید شد${input.notes ? ` — ${input.notes}` : ""}` });
      await finishStep(tx, step, input.notes ?? null);
      return;
    }
    const reason = input.reason?.trim();
    if (!reason) throw validation("دلیل رد کیفیت را بنویسید.");
    const targetKey = input.returnTo ?? defaultReturnTarget(plan, step.key);
    if (!targetKey) throw validation("مرحله بازگشت را انتخاب کنید.");
    if (!isArtworkTarget(targetKey)) {
      const target = plan.find((s) => s.key === targetKey);
      if (!target || target.phase >= step.phase) throw validation("مرحله بازگشت معتبر نیست.");
    }
    await tx.db.insert(qualityApprovals).values({ orderId: order.id, stepId, decision: "REJECTED", approverId: actorUserId(tx)!, notes: input.notes ?? null, reason, returnToStep: targetKey });
    const label = await applyReturn(tx, order, plan, targetKey, reason);
    await orderEvent(tx, { orderId: order.id, domain: "QUALITY", type: "QUALITY_REJECTED", message: `${st.name}: رد شد — ${reason}. بازگشت به «${label}»` });
    await audit(tx, { action: "quality.reject", entityType: "order", entityId: order.id, after: { step: step.key, returnTo: targetKey }, reason });
    await refreshOrder(tx, order.id);
  });
}

// ── Sending work back ───────────────────────────────────────────────────────

/** Special return targets besides the plan's own steps. */
export const RETURN_DESIGN = "DESIGN";
export const RETURN_CUSTOMER_FILE = "CUSTOMER_FILE";
export const isArtworkTarget = (t: string) => t === RETURN_DESIGN || t === RETURN_CUSTOMER_FILE;
export const RETURN_LABEL: Record<string, string> = { [RETURN_DESIGN]: "طراحی مجدد", [RETURN_CUSTOMER_FILE]: "اصلاح فایل توسط مشتری" };

const RESET = { startedAt: null, startedBy: null, completedAt: null, completedBy: null };

/**
 * Sends an order back: the target step is open again (one more rework) and
 * every step after it must be done again, because the work changed. Steps of
 * the same phase (offset lithography ‖ paper) are left as they are.
 *
 * - DESIGN: the design is redone (designer queue); work that depends on the
 *   file waits until the new design is completed.
 * - CUSTOMER_FILE: the customer is asked for a corrected file.
 * - Returning to the shipping step (or before it) cancels a recorded dispatch.
 *
 * Returns the label of where the work went.
 */
export async function applyReturn(ctx: Ctx, order: Order, plan: Step[], target: string, reason: string): Promise<string> {
  const now = new Date();
  const rework = sql`${productionSteps.reworkCount} + 1`;
  let fromPhase: number;
  let label: string;
  if (isArtworkTarget(target)) {
    const art = plan.filter((s) => station(s.key).needsArtwork);
    if (art.length === 0) throw validation("در مسیر این سفارش مرحله‌ای به فایل طرح وابسته نیست.");
    fromPhase = Math.min(...art.map((s) => s.phase));
    for (const s of plan) {
      if (s.phase === fromPhase && station(s.key).needsArtwork) await ctx.db.update(productionSteps).set({ status: "READY", readyAt: now, reworkCount: s.status === "WAITING" || s.status === "READY" ? s.reworkCount : rework, ...RESET }).where(eq(productionSteps.id, s.id));
    }
    if (target === RETURN_DESIGN) {
      await ctx.db.update(orders).set({ needsDesign: true, artworkStatus: "DESIGN_REQUESTED" }).where(eq(orders.id, order.id));
      await orderEvent(ctx, { orderId: order.id, domain: "ARTWORK", type: "DESIGN_REDO", message: `طراحی مجدد: ${reason}` });
    } else {
      await ctx.db.update(orders).set({ artworkStatus: "NEEDS_CORRECTION" }).where(eq(orders.id, order.id));
      await orderEvent(ctx, { orderId: order.id, domain: "ARTWORK", type: "FILE_CORRECTION", message: `فایل طرح نیاز به اصلاح دارد: ${reason}`, visibleToCustomer: true });
      await emit(ctx, "ArtworkNeedsCorrection", { type: "order", id: order.id }, { orderId: order.id, note: reason });
    }
    label = RETURN_LABEL[target]!;
  } else {
    const t = plan.find((s) => s.key === target);
    if (!t) throw validation("مرحله بازگشت در مسیر این سفارش نیست.");
    if (t.status !== "DONE" && t.status !== "IN_PROGRESS") throw invalidState(`«${station(t.key).name}» هنوز انجام نشده است.`);
    fromPhase = t.phase;
    await ctx.db.update(productionSteps).set({ status: "READY", readyAt: now, reworkCount: rework, ...RESET }).where(eq(productionSteps.id, t.id));
    // Undoing a paper selection puts the paper back in stock.
    if (station(t.key).kind === "PAPER_SELECT" && t.status === "DONE" && typeof t.data.materialId === "string" && Number(t.data.quantity) > 0) {
      const qty = Number(t.data.quantity);
      await ctx.db.update(materials).set({ stock: sql`${materials.stock} + ${qty}` }).where(eq(materials.id, t.data.materialId));
      await ctx.db.insert(stockMovements).values({ materialId: t.data.materialId, delta: qty, reason: "ADJUST", orderId: order.id, note: `${order.code} — بازگشت کاغذ (${reason})`, createdBy: actorUserId(ctx) });
    }
    label = station(t.key).name;
  }
  const later = plan.filter((s) => s.phase > fromPhase && s.status !== "WAITING");
  for (const s of later) await ctx.db.update(productionSteps).set({ status: "WAITING", readyAt: null, ...RESET }).where(eq(productionSteps.id, s.id));
  // The order is back in the house: a recorded dispatch no longer stands.
  const ship = plan.find((s) => station(s.key).kind === "SHIPPING");
  if (ship && ship.status !== "WAITING" && ship.status !== "READY" && (ship.phase > fromPhase || ship.key === target)) {
    await ctx.db.delete(shipments).where(eq(shipments.orderId, order.id));
    await ctx.db.update(orders).set({ shippedAt: null, deliveredAt: null }).where(eq(orders.id, order.id));
  }
  await refreshOrder(ctx, order.id);
  return label;
}

/**
 * Returns an order to an earlier point (with a reason, audited).
 * The manager can send any order back anywhere. Whoever finished a step can
 * undo their own mistake as long as nothing after it has started.
 */
export async function returnOrder(ctx: Ctx, orderId: string, input: { target: string; reason: string }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw validation("دلیل بازگشت را بنویسید.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    if (!isActive(o)) throw invalidState(o.status === "DELIVERED" ? "این سفارش تحویل شده است." : "این سفارش در جریان تولید نیست.");
    const plan = await stepsOf(tx, orderId);
    const manager = can(tx, "dashboard.view");
    if (!manager) {
      const t = plan.find((s) => s.key === input.target);
      const me = actorUserId(tx);
      if (!t || isArtworkTarget(input.target) || !can(tx, station(t.key).permission)) throw forbidden("بازگرداندن سفارش فقط با مدیر است.");
      if (t.completedBy !== me && t.startedBy !== me) throw forbidden("فقط مرحله‌ای را که خودتان ثبت کرده‌اید می‌توانید لغو کنید؛ برای بقیه به مدیر بگویید.");
      if (plan.some((s) => s.phase > t.phase && (s.status === "IN_PROGRESS" || s.status === "DONE"))) throw invalidState("مرحله بعد شروع شده است؛ لغو آن فقط با مدیر است.");
    }
    const label = await applyReturn(tx, o, plan, input.target, reason);
    await orderEvent(tx, { orderId, domain: "PRODUCTION", type: "RETURNED", message: `بازگشت به «${label}»: ${reason}` });
    await audit(tx, { action: "order.return", entityType: "order", entityId: orderId, after: { target: input.target }, reason });
    return { label };
  });
}

/**
 * Changes an order's plan while it is in production, e.g. the customer calls
 * after printing and wants lamination. Added stations join the plan; steps
 * after them are done again (quality, packaging …). Unfinished optional
 * stations can be removed. An optional charge is added to the order.
 */
export async function editPlan(ctx: Ctx, orderId: string, input: { add?: string[]; remove?: string[]; reason: string; charge?: number | null }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw validation("دلیل تغییر مسیر را بنویسید.");
  const add = [...new Set(input.add ?? [])];
  const remove = [...new Set(input.remove ?? [])];
  if (!add.length && !remove.length) throw validation("ایستگاهی برای اضافه یا حذف انتخاب نشده است.");
  const charge = input.charge ?? 0;
  if (!Number.isInteger(charge) || charge < 0) throw validation("مبلغ نامعتبر است.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    if (!can(tx, "dashboard.view") && !can(tx, APPROVE_PERMISSION[o.productionType])) throw forbidden();
    if (!isActive(o) || o.status === "SHIPPING") throw invalidState("مسیر فقط برای سفارش در حال تولید قابل تغییر است.");
    const plan = await stepsOf(tx, orderId);
    const now = new Date();
    for (const key of add) {
      const st = STATIONS.find((s) => s.key === key);
      if (!st || st.type !== o.productionType) throw validation("ایستگاه انتخاب‌شده برای این نوع چاپ نیست.");
      if (plan.some((s) => s.key === key)) throw validation(`«${st.name}» در مسیر این سفارش هست.`);
    }
    for (const key of remove) {
      const s = plan.find((x) => x.key === key);
      if (!s) throw validation("ایستگاه انتخاب‌شده در مسیر نیست.");
      if (station(key).required) throw validation(`«${station(key).name}» الزامی است و حذف نمی‌شود.`);
      if (s.status === "DONE" || s.status === "IN_PROGRESS") throw invalidState(`«${station(key).name}» شروع یا انجام شده و حذف نمی‌شود؛ ابتدا سفارش را به قبل از آن برگردانید.`);
    }
    if (add.length) {
      await tx.db.insert(productionSteps).values(add.map((key) => ({ orderId, key, phase: station(key).phase, status: "WAITING" as const })));
      const from = Math.min(...add.map((k) => station(k).phase));
      for (const s of plan) if (s.phase > from && s.status !== "WAITING") await tx.db.update(productionSteps).set({ status: "WAITING", readyAt: null, ...RESET }).where(eq(productionSteps.id, s.id));
    }
    for (const key of remove) await tx.db.delete(productionSteps).where(and(eq(productionSteps.orderId, orderId), eq(productionSteps.key, key)));
    const rest = await stepsOf(tx, orderId);
    if (!rest.some((s) => station(s.key).kind !== "SHIPPING" && station(s.key).kind !== "QUALITY")) throw validation("حداقل یک ایستگاه تولید باید بماند.");
    const names = [...add.map((k) => `+ ${station(k).name}`), ...remove.map((k) => `− ${station(k).name}`)].join("، ");
    if (charge > 0) {
      const [{ n }] = (await tx.db.select({ n: sql<number>`coalesce(max(${orderItems.lineNo}), 0)::int` }).from(orderItems).where(eq(orderItems.orderId, orderId))) as [{ n: number }];
      await tx.db.insert(orderItems).values({ orderId, lineNo: n + 1, title: `تغییر سفارش: ${add.map((k) => station(k).name).join("، ") || "اصلاح مسیر"}`, quantity: 1, unitLabel: "خدمت", lineSubtotal: charge, note: reason });
      await recalcOrder(tx, orderId);
    }
    await orderEvent(tx, { orderId, domain: "PRODUCTION", type: "PLAN_CHANGED", message: `تغییر مسیر تولید (${names}): ${reason}${charge ? ` — هزینه ${formatToman(charge)}` : ""}` });
    await audit(tx, { action: "order.plan", entityType: "order", entityId: orderId, before: { steps: plan.map((s) => s.key) }, after: { add, remove, charge }, reason });
    void now;
    await refreshOrder(tx, orderId);
  });
}

// ── Assignment and priority ─────────────────────────────────────────────────

export async function assignMachine(ctx: Ctx, stepId: string, machineId: string) {
  assertCan(ctx, "offset.press.assign");
  return inTx(ctx, async (tx) => {
    const { step } = await loadStep(tx, stepId);
    if (station(step.key).kind !== "PRINT") throw invalidState("ماشین فقط برای مرحله چاپ افست تعیین می‌شود.");
    if (step.status === "DONE") throw invalidState("چاپ این سفارش انجام شده است.");
    const [m] = await tx.db.select().from(machines).where(and(eq(machines.id, machineId), eq(machines.isActive, true)));
    if (!m || m.category === "DIGITAL") throw validation("ماشین چاپ افست معتبر نیست.");
    await tx.db.update(productionSteps).set({ machineId }).where(eq(productionSteps.id, stepId));
    await orderEvent(tx, { orderId: step.orderId, domain: "PRODUCTION", type: "PRESS_ASSIGNED", message: `ماشین چاپ: ${m.name}` });
  });
}

/** Does this employee hold the permission (through any of their roles)? */
export async function employeeHasPermission(ctx: Ctx, employeeId: string, permission: string) {
  const [r] = await ctx.db
    .select({ id: employees.id, name: users.fullName, userId: users.id })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .innerJoin(employeeRoles, eq(employeeRoles.employeeId, employees.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, employeeRoles.roleId))
    .where(and(eq(employees.id, employeeId), eq(employees.isActive, true), eq(users.isActive, true), eq(rolePermissions.permission, permission)))
    .limit(1);
  return r ?? null;
}

/**
 * The manager hands a step to a specific person (e.g. someone did not follow
 * it up). Until then whoever starts it takes it. `null` frees the step again.
 */
export async function assignStep(ctx: Ctx, stepId: string, employeeId: string | null) {
  assertCan(ctx, "dashboard.view");
  return inTx(ctx, async (tx) => {
    const { step, order, st } = await loadStep(tx, stepId);
    if (step.status === "DONE") throw invalidState("این مرحله انجام شده است.");
    let name = "";
    let userId = "";
    if (employeeId) {
      const e = await employeeHasPermission(tx, employeeId, st.permission);
      if (!e) throw validation(`این همکار دسترسی «${st.name}» را ندارد.`);
      name = e.name;
      userId = e.userId;
    }
    await tx.db.update(productionSteps).set({ assigneeId: employeeId, assignedBy: employeeId ? actorUserId(tx) : null }).where(eq(productionSteps.id, stepId));
    await orderEvent(tx, { orderId: order.id, domain: "PRODUCTION", type: "STEP_ASSIGNED", message: employeeId ? `${st.name} به ${name} ارجاع شد` : `ارجاع ${st.name} برداشته شد` });
    await audit(tx, { action: "step.assign", entityType: "order", entityId: order.id, before: { step: step.key, assigneeId: step.assigneeId }, after: { assigneeId: employeeId } });
    if (employeeId) await emit(tx, "StepAssigned", { type: "order", id: order.id }, { orderId: order.id, stepKey: step.key, assigneeUserId: userId });
  });
}

/** The manager gives the order's design to another designer. */
export async function assignDesigner(ctx: Ctx, orderId: string, employeeId: string) {
  assertCan(ctx, "dashboard.view");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    const e = await employeeHasPermission(tx, employeeId, "design.work");
    if (!e) throw validation("این همکار دسترسی طراحی ندارد.");
    await tx.db.update(orders).set({ designerId: employeeId }).where(eq(orders.id, orderId));
    await emit(tx, "DesignAssigned", { type: "order", id: orderId }, { orderId, designerUserId: e.userId });
    await orderEvent(tx, { orderId, domain: "ARTWORK", type: "DESIGNER_ASSIGNED", message: `طراحی به ${e.name} ارجاع شد` });
    await audit(tx, { action: "design.assign", entityType: "order", entityId: orderId, before: { designerId: o.designerId }, after: { designerId: employeeId } });
  });
}

/**
 * Explicit, audited queue priority. Only roles with order.priority that work
 * on this production type may change it; an extra charge is added to the order.
 */
export async function setPriority(ctx: Ctx, orderId: string, input: { isPriority: boolean; reason: string; charge?: number | null }) {
  assertCan(ctx, "order.priority");
  const reason = input.reason.trim();
  if (reason.length < 3) throw validation("دلیل تغییر اولویت را بنویسید.");
  const charge = input.charge ?? 0;
  if (!Number.isInteger(charge) || charge < 0) throw validation("مبلغ اولویت نامعتبر است.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    if (!worksOnType(tx, o.productionType)) throw forbidden();
    if (!isActive(o) && o.status !== "WAITING_APPROVAL") throw invalidState("اولویت فقط برای سفارش‌های در جریان قابل تغییر است.");
    if (o.isPriority === input.isPriority) throw invalidState(input.isPriority ? "این سفارش همین حالا اولویت دارد." : "این سفارش اولویت ندارد.");
    await tx.db.insert(priorityChanges).values({ orderId, isPriority: input.isPriority, reason, charge: charge || null, changedBy: actorUserId(tx)! });
    await tx.db.update(orders).set({ isPriority: input.isPriority, prioritySetAt: input.isPriority ? new Date() : null }).where(eq(orders.id, orderId));
    if (charge > 0) {
      const [{ n }] = (await tx.db.select({ n: sql<number>`coalesce(max(${orderItems.lineNo}), 0)::int` }).from(orderItems).where(eq(orderItems.orderId, orderId))) as [{ n: number }];
      await tx.db.insert(orderItems).values({ orderId, lineNo: n + 1, title: "هزینه اولویت در صف تولید", quantity: 1, unitLabel: "خدمت", lineSubtotal: charge, note: reason });
      await recalcOrder(tx, orderId);
    }
    await orderEvent(tx, { orderId, domain: "PRODUCTION", type: input.isPriority ? "PRIORITY_ON" : "PRIORITY_OFF", message: `${input.isPriority ? "اولویت داده شد" : "اولویت برداشته شد"}: ${reason}${charge ? ` (هزینه ${formatToman(charge)})` : ""}` });
    await audit(tx, { action: "order.priority", entityType: "order", entityId: orderId, before: { isPriority: o.isPriority }, after: { isPriority: input.isPriority, charge }, reason });
  });
}

/** Steps a staff member may act on, for authorization in queries. */
export function canWorkStation(ctx: Ctx, key: string) {
  return can(ctx, station(key).permission);
}

export { assertOrderAccess };
