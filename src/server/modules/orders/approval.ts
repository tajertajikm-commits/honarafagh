import { and, asc, eq, sql } from "drizzle-orm";
import { employeeRoles, employees, orderApprovals, orderItems, orders, rolePermissions, users } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, can, inTx, requireCustomer } from "@/server/core/context";
import { forbidden, invalidState, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { createPlan, refreshOrder } from "@/server/modules/workflow/engine";
import { APPROVE_PERMISSION } from "@/server/modules/workflow/stations";
import { formatToman } from "@/lib/persian";
import { assertOwnFiles } from "./create";
import { loadOrder, orderEvent, recalcOrder, type Order } from "./state";

const OPEN = ["WAITING_APPROVAL", "NEEDS_INFO"] as const;

function assertCanApprove(ctx: Ctx, o: Order) {
  assertCan(ctx, APPROVE_PERMISSION[o.productionType]);
  if (!(OPEN as readonly string[]).includes(o.status)) throw invalidState("این سفارش در انتظار تأیید نیست.");
}

/** The default designer: the active employee holding design.work (Mr. Memarian). */
export async function defaultDesigner(ctx: Ctx): Promise<{ employeeId: string; userId: string } | null> {
  const [d] = await ctx.db
    .select({ employeeId: employees.id, userId: employees.userId })
    .from(employees)
    .innerJoin(employeeRoles, eq(employeeRoles.employeeId, employees.id))
    .innerJoin(rolePermissions, and(eq(rolePermissions.roleId, employeeRoles.roleId), eq(rolePermissions.permission, "design.work")))
    .where(eq(employees.isActive, true))
    .orderBy(asc(employees.personnelCode))
    .limit(1);
  return d ?? null;
}

export interface ApproveInput {
  steps: string[];
  notes?: string | null;
  /** Optional price for custom orders (approvers holding order.price). */
  price?: { amount: number; discount?: number } | null;
  designerId?: string | null;
}

/**
 * Approves an order: records who/when/notes and the stations this order
 * really needs, creates its production plan, and hands design work to the
 * designer when the customer asked for design.
 */
export async function approveOrder(ctx: Ctx, orderId: string, input: ApproveInput) {
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    assertCanApprove(tx, o);
    const plan = await createPlan(tx, o, input.steps);
    await tx.db.insert(orderApprovals).values({ orderId, decision: "APPROVED", approverId: actorUserId(tx)!, notes: input.notes?.trim() || null, selectedSteps: plan.map((s) => s.key) });
    let designerId: string | null = null;
    let designerUserId: string | null = null;
    if (o.needsDesign) {
      if (input.designerId) {
        const [d] = await tx.db.select({ id: employees.id, userId: employees.userId }).from(employees).where(and(eq(employees.id, input.designerId), eq(employees.isActive, true)));
        if (!d) throw validation("طراح انتخاب‌شده معتبر نیست.");
        designerId = d.id;
        designerUserId = d.userId;
      } else {
        const d = await defaultDesigner(tx);
        designerId = d?.employeeId ?? null;
        designerUserId = d?.userId ?? null;
      }
    }
    await tx.db.update(orders).set({ status: "APPROVED", approvedAt: new Date(), designerId: designerId ?? o.designerId }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "APPROVAL", type: "APPROVED", message: `تأیید شد — مسیر تولید: ${plan.map((s) => s.short).join("، ")}${input.notes ? ` — ${input.notes}` : ""}` });
    await orderEvent(tx, { orderId, domain: "ORDER", type: "STATUS_APPROVED", message: "سفارش تأیید شد", visibleToCustomer: true });
    await emit(tx, "OrderApproved", { type: "order", id: orderId }, { orderId });
    if (o.needsDesign) {
      await orderEvent(tx, { orderId, domain: "ARTWORK", type: "DESIGN_ASSIGNED", message: "طراحی به مسئول طراحی سپرده شد" });
      await emit(tx, "DesignAssigned", { type: "order", id: orderId }, { orderId, designerUserId });
    }
    if (input.price && input.price.amount > 0) await applyPrice(tx, { ...o, status: "APPROVED" }, { amount: input.price.amount, discount: input.price.discount ?? 0 });
    await audit(tx, { action: "order.approve", entityType: "order", entityId: orderId, after: { steps: plan.map((s) => s.key) } });
    await refreshOrder(tx, orderId);
  });
}

export async function rejectOrder(ctx: Ctx, orderId: string, input: { reason: string; notes?: string | null }) {
  const reason = input.reason.trim();
  if (reason.length < 3) throw validation("دلیل رد سفارش را بنویسید.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    assertCanApprove(tx, o);
    await tx.db.insert(orderApprovals).values({ orderId, decision: "REJECTED", approverId: actorUserId(tx)!, reason, notes: input.notes?.trim() || null });
    await tx.db.update(orders).set({ status: "REJECTED" }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "APPROVAL", type: "REJECTED", message: `سفارش پذیرفته نشد: ${reason}`, visibleToCustomer: true });
    await emit(tx, "OrderRejected", { type: "order", id: orderId }, { orderId, note: reason });
    await audit(tx, { action: "order.reject", entityType: "order", entityId: orderId, reason });
  });
}

/** Sends the order back to the customer for clarification. */
export async function requestInfo(ctx: Ctx, orderId: string, input: { notes: string }) {
  const notes = input.notes.trim();
  if (notes.length < 3) throw validation("سؤال یا توضیح موردنیاز را بنویسید.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    assertCanApprove(tx, o);
    await tx.db.insert(orderApprovals).values({ orderId, decision: "NEEDS_INFO", approverId: actorUserId(tx)!, notes });
    await tx.db.update(orders).set({ status: "NEEDS_INFO" }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "MESSAGE", type: "INFO_REQUESTED", message: notes, visibleToCustomer: true });
    await emit(tx, "OrderNeedsInfo", { type: "order", id: orderId }, { orderId, note: notes });
  });
}

/** The customer's answer (optionally with new files); the order returns to the approval queue. */
export async function customerReply(ctx: Ctx, orderId: string, input: { message: string; fileIds?: string[] }) {
  requireCustomer(ctx);
  const message = input.message.trim();
  if (message.length < 2) throw validation("پیام را بنویسید.");
  await assertOwnFiles(ctx, input.fileIds ?? []);
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    if (o.status === "REJECTED" || o.status === "CANCELLED" || o.status === "DELIVERED") throw invalidState("این سفارش بسته شده است.");
    await orderEvent(tx, { orderId, domain: "MESSAGE", type: "CUSTOMER_MESSAGE", message, visibleToCustomer: true });
    if (input.fileIds?.length) {
      const { addArtworkVersions } = await import("./artwork");
      await addArtworkVersions(tx, o, input.fileIds, null);
    }
    if (o.status === "NEEDS_INFO") await tx.db.update(orders).set({ status: "WAITING_APPROVAL" }).where(eq(orders.id, orderId));
    await emit(tx, "CustomerReplied", { type: "order", id: orderId }, { orderId });
  });
}

// ── Price ───────────────────────────────────────────────────────────────────

async function applyPrice(ctx: Ctx, o: Order, input: { amount: number; discount: number; vatPct?: number }) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw validation("مبلغ نامعتبر است.");
  if (!Number.isInteger(input.discount) || input.discount < 0) throw validation("تخفیف نامعتبر است.");
  if (o.kind === "CUSTOM") {
    // The project is one invoice line (priority charges stay as their own lines).
    const projectLines = await ctx.db.select({ id: orderItems.id }).from(orderItems).where(and(eq(orderItems.orderId, o.id), sql`${orderItems.productId} IS NULL`, eq(orderItems.lineNo, 1)));
    if (projectLines[0]) await ctx.db.update(orderItems).set({ lineSubtotal: input.amount, quantity: o.quantity ?? 1 }).where(eq(orderItems.id, projectLines[0].id));
    else {
      await ctx.db.update(orderItems).set({ lineNo: sql`${orderItems.lineNo} + 100` }).where(eq(orderItems.orderId, o.id));
      await ctx.db.insert(orderItems).values({ orderId: o.id, lineNo: 1, title: o.title, description: [o.dimensions, o.material, o.colors, o.finishing].filter(Boolean).join(" • ") || null, quantity: o.quantity ?? 1, unitLabel: "عدد", lineSubtotal: input.amount });
    }
  }
  await ctx.db.update(orders).set({ discountAmount: input.discount, pricedAt: new Date(), ...(input.vatPct != null ? { vatPct: input.vatPct } : {}) }).where(eq(orders.id, o.id));
  const updated = await recalcOrder(ctx, o.id);
  await orderEvent(ctx, { orderId: o.id, domain: "PAYMENT", type: "PRICED", message: `مبلغ سفارش: ${formatToman(updated.total)}`, visibleToCustomer: true });
  await emit(ctx, "OrderPriced", { type: "order", id: o.id }, { orderId: o.id });
  return updated;
}

/**
 * Sets the price of a custom order (project amount excluding VAT, plus an
 * optional discount). For store orders only the discount can change.
 */
export async function setOrderPrice(ctx: Ctx, orderId: string, input: { amount?: number; discount: number; vatPct?: number }) {
  assertCan(ctx, "order.price");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    if (o.status === "REJECTED" || o.status === "CANCELLED") throw invalidState("این سفارش بسته شده است.");
    if (o.kind === "STORE") {
      await tx.db.update(orders).set({ discountAmount: input.discount }).where(eq(orders.id, orderId));
      const updated = await recalcOrder(tx, orderId);
      await audit(tx, { action: "order.discount", entityType: "order", entityId: orderId, before: { discount: o.discountAmount }, after: { discount: input.discount } });
      return updated;
    }
    if (!input.amount) throw validation("مبلغ سفارش را وارد کنید.");
    const updated = await applyPrice(tx, o, { amount: input.amount, discount: input.discount, vatPct: input.vatPct });
    await audit(tx, { action: "order.price", entityType: "order", entityId: orderId, before: { total: o.total }, after: { total: updated.total } });
    return updated;
  });
}

export async function cancelOrder(ctx: Ctx, orderId: string, reason: string) {
  const r = reason.trim();
  if (r.length < 3) throw validation("دلیل لغو را بنویسید.");
  return inTx(ctx, async (tx) => {
    const o = await loadOrder(tx, orderId, { lock: true });
    if (ctx.actor.kind === "customer") {
      if (!(OPEN as readonly string[]).includes(o.status)) throw invalidState("سفارش تأییدشده را فقط چاپخانه می‌تواند لغو کند. لطفاً تماس بگیرید.");
    } else if (!can(tx, "order.cancel")) throw forbidden();
    if (o.status === "DELIVERED" || o.status === "CANCELLED" || o.status === "REJECTED") throw invalidState("این سفارش بسته شده است.");
    await tx.db.update(orders).set({ status: "CANCELLED", cancelledAt: new Date(), cancelReason: r }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "ORDER", type: "CANCELLED", message: `سفارش لغو شد: ${r}`, visibleToCustomer: true });
    await emit(tx, "OrderCancelled", { type: "order", id: orderId }, { orderId, reason: r });
    await audit(tx, { action: "order.cancel", entityType: "order", entityId: orderId, reason: r });
  });
}

/** The approval history (decisions with approver names). */
export async function approvalsOf(ctx: Ctx, orderId: string) {
  return ctx.db
    .select({ approval: orderApprovals, approverName: users.fullName })
    .from(orderApprovals)
    .innerJoin(users, eq(users.id, orderApprovals.approverId))
    .where(eq(orderApprovals.orderId, orderId))
    .orderBy(asc(orderApprovals.createdAt));
}

/** Stations suggested in the approval form (store orders: from the priced operations). */
export async function suggestedStations(ctx: Ctx, o: Order): Promise<string[]> {
  const { stationsOf, suggestedPlan } = await import("@/server/modules/workflow/stations");
  if (o.kind !== "STORE") {
    const fin = `${o.finishing ?? ""} ${o.description ?? ""}`;
    return stationsOf(o.productionType)
      .filter((s) => s.defaultOn || (/سلفون|لمینت|uv/i.test(fin) && s.key.endsWith("LAMINATION")) || (/صحافی|منگنه|سیمی|ته.?چسب/.test(fin) && s.key.endsWith("BINDING")))
      .map((s) => s.key);
  }
  const items = await ctx.db.select({ price: orderItems.priceSnapshot }).from(orderItems).where(eq(orderItems.orderId, o.id));
  const ops = items.flatMap((i) => i.price?.operations?.map((op) => op.stepType) ?? []);
  return suggestedPlan(o.productionType, ops);
}

