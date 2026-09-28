import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import {
  addresses,
  artworkVersions,
  cartItems,
  customers,
  deliveryMethods,
  materialRequirements,
  orderChangeRequests,
  orderItems,
  orders,
  productMethods,
  productionJobs,
  productionTasks,
  products,
  taskTimeLogs,
  type AddressSnapshot,
} from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, can, inTx, requireCustomer } from "@/server/core/context";
import { AppError, conflict, forbidden, invalidState, isUniqueViolation, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { emit } from "@/server/events/outbox";
import { createRequirements, releaseRequirement, reserveRequirement } from "@/server/modules/inventory/service";
import { recomputeItemFileStatus } from "@/server/modules/files/service";
import { PRIORITY_SCORE, releaseItem, syncOrder } from "@/server/modules/production/engine";
import { priceProduct } from "@/server/modules/pricing/service";
import type { PriceBreakdown, Selections, UrgencyLevel } from "@/server/modules/pricing/types";
import { addWorkingMinutes } from "@/server/modules/scheduling/calendar";
import { getSetting, workCalendar } from "@/server/modules/settings/service";
import { findCart } from "./cart";
import { bumpOrderVersion, orderEvent, recomputeOrder } from "./state";

type Order = typeof orders.$inferSelect;
type OrderPriority = Order["priority"];

export const vatOf = (base: number, pct: number) => Math.round((Math.max(0, base) * pct) / 100);

export function computeTotals(input: { itemSubtotals: number[]; discount: number; shipping: number; vatPct: number }) {
  const subtotal = input.itemSubtotals.reduce((s, x) => s + x, 0);
  if (input.discount > subtotal) throw validation("تخفیف نمی‌تواند بیشتر از مبلغ سفارش باشد.");
  const vatAmount = vatOf(subtotal - input.discount + input.shipping, input.vatPct);
  return { subtotal, vatAmount, total: subtotal - input.discount + input.shipping + vatAmount };
}

async function recalcOrderTotals(ctx: Ctx, orderId: string) {
  const [o] = await ctx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
  const items = await ctx.db.select({ s: orderItems.lineSubtotal, c: orderItems.costTotal }).from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "ACTIVE")));
  const t = computeTotals({ itemSubtotals: items.map((i) => i.s), discount: Math.min(o!.discountAmount, items.reduce((s, i) => s + i.s, 0)), shipping: o!.shippingAmount, vatPct: o!.vatPct });
  await ctx.db
    .update(orders)
    .set({ subtotal: t.subtotal, vatAmount: t.vatAmount, total: t.total, costTotal: items.reduce((s, i) => s + i.c, 0) })
    .where(eq(orders.id, orderId));
  return t;
}

async function workflowFor(ctx: Ctx, productId: string, method: string) {
  const [m] = await ctx.db.select().from(productMethods).where(and(eq(productMethods.productId, productId), eq(productMethods.methodCode, method)));
  if (!m) throw invalidState("روش تولید این محصول تعریف نشده است.");
  return m.workflowTemplateCode;
}

async function deliverySnapshot(ctx: Ctx, customerId: string, input: { deliveryMethodId: string; addressId?: string | null; address?: AddressSnapshot | null }) {
  const [method] = await ctx.db.select().from(deliveryMethods).where(and(eq(deliveryMethods.id, input.deliveryMethodId), eq(deliveryMethods.isActive, true)));
  if (!method) throw validation("روش ارسال نامعتبر است.");
  let address: AddressSnapshot | null = null;
  if (method.kind !== "PICKUP") {
    if (input.addressId) {
      const [a] = await ctx.db.select().from(addresses).where(and(eq(addresses.id, input.addressId), eq(addresses.customerId, customerId)));
      if (!a) throw validation("آدرس انتخاب‌شده معتبر نیست.");
      address = { title: a.title, province: a.province, city: a.city, line: a.line, postalCode: a.postalCode, recipientName: a.recipientName, recipientPhone: a.recipientPhone };
    } else if (input.address) address = input.address;
    else throw validation("آدرس ارسال را وارد کنید.");
  }
  return { method, address };
}

interface NewItem {
  productId: string | null;
  title: string;
  quantity: number;
  unitLabel: string;
  selections: Selections;
  price: PriceBreakdown | null;
  lineSubtotal: number;
  costTotal: number;
  isPriceOverridden: boolean;
  workflowTemplateCode: string | null;
  needsDesign: boolean;
  artworkFileIds: string[];
  note?: string | null;
}

async function insertOrder(
  ctx: Ctx,
  input: {
    customerId: string;
    source: Order["source"];
    quoteId?: string | null;
    items: NewItem[];
    urgency: UrgencyLevel;
    priority: OrderPriority;
    discount: number;
    deliveryMethodId: string | null;
    shipping: number;
    address: AddressSnapshot | null;
    customerNote?: string | null;
    internalNote?: string | null;
    idempotencyKey?: string | null;
    dueDate?: Date | null;
  },
) {
  if (input.items.length === 0) throw validation("سفارش باید حداقل یک قلم داشته باشد.");
  const settings = await getSetting(ctx.db, "orders");
  const vatPct = input.items.find((i) => i.price)?.price?.vatPct ?? 10;
  const totals = computeTotals({ itemSubtotals: input.items.map((i) => i.lineSubtotal), discount: input.discount, shipping: input.shipping, vatPct });
  let order: Order;
  try {
    [order] = (await ctx.db
      .insert(orders)
      .values({
        customerId: input.customerId,
        source: input.source,
        quoteId: input.quoteId ?? null,
        status: "PENDING_REVIEW",
        urgency: input.urgency,
        priority: input.priority,
        subtotal: totals.subtotal,
        discountAmount: input.discount,
        shippingAmount: input.shipping,
        vatPct,
        vatAmount: totals.vatAmount,
        total: totals.total,
        costTotal: input.items.reduce((s, i) => s + i.costTotal, 0),
        depositPct: settings.defaultDepositPct,
        deliveryMethodId: input.deliveryMethodId,
        shippingAddress: input.address,
        customerNote: input.customerNote ?? null,
        internalNote: input.internalNote ?? null,
        dueDate: input.dueDate ?? null,
        createdBy: actorUserId(ctx),
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning()) as [Order];
  } catch (err) {
    if (isUniqueViolation(err, "orders_idempotency_uq")) throw conflict("این سفارش قبلاً ثبت شده است.", { duplicate: true });
    throw err;
  }
  for (const [i, it] of input.items.entries()) {
    const [row] = await ctx.db
      .insert(orderItems)
      .values({
        orderId: order.id,
        lineNo: i + 1,
        productId: it.productId,
        title: it.title,
        quantity: it.quantity,
        unitLabel: it.unitLabel,
        selections: it.selections,
        priceSnapshot: it.price,
        pricingVersionId: it.price?.ruleVersionId ?? null,
        lineSubtotal: it.lineSubtotal,
        costTotal: it.costTotal,
        isPriceOverridden: it.isPriceOverridden,
        productionMethod: it.price?.method ?? null,
        workflowTemplateCode: it.workflowTemplateCode,
        needsDesign: it.needsDesign,
        note: it.note ?? null,
      })
      .returning();
    let versionNo = 0;
    for (const fileId of it.artworkFileIds) {
      await ctx.db.insert(artworkVersions).values({ orderItemId: row!.id, versionNo: ++versionNo, stage: "CUSTOMER_ORIGINAL", status: "UPLOADED", fileId, uploadedBy: actorUserId(ctx) });
    }
    await recomputeItemFileStatus(ctx, row!.id);
  }
  await orderEvent(ctx, { orderId: order.id, domain: "ORDER", type: "PLACED", to: "PENDING_REVIEW", message: "سفارش ثبت شد", visibleToCustomer: true });
  await emit(ctx, "OrderPlaced", { type: "order", id: order.id }, { orderId: order.id });
  await recomputeOrder(ctx, order.id);
  return order;
}

// ── Checkout (customer website) ─────────────────────────────────────────────

export interface CheckoutInput {
  deliveryMethodId: string;
  addressId?: string | null;
  address?: AddressSnapshot | null;
  note?: string | null;
  expectedTotal: number;
  idempotencyKey: string;
}

export async function checkout(ctx: Ctx, input: CheckoutInput) {
  const actor = requireCustomer(ctx);
  return inTx(ctx, async (tx) => {
    const cart = await findCart(tx);
    if (!cart) throw validation("سبد خرید خالی است.");
    await tx.db.execute(sql`SELECT id FROM carts WHERE id = ${cart.id} FOR UPDATE`);
    const lines = await tx.db
      .select({ item: cartItems, product: products })
      .from(cartItems)
      .innerJoin(products, eq(products.id, cartItems.productId))
      .where(eq(cartItems.cartId, cart.id));
    if (lines.length === 0) throw validation("سبد خرید خالی است.");
    const items: NewItem[] = [];
    for (const { item, product } of lines) {
      const price = await priceProduct(tx.db, { productId: item.productId, quantity: item.quantity, selections: item.selections, urgency: item.urgency, customerId: actor.customerId });
      items.push({
        productId: product.id,
        title: product.name,
        quantity: item.quantity,
        unitLabel: product.unitLabel,
        selections: item.selections,
        price,
        lineSubtotal: price.subtotal,
        costTotal: price.costTotal,
        isPriceOverridden: false,
        workflowTemplateCode: await workflowFor(tx, product.id, price.method),
        needsDesign: price.flags.includes("NEEDS_DESIGN"),
        artworkFileIds: item.artworkFileIds,
        note: item.note,
      });
    }
    const { method, address } = await deliverySnapshot(tx, actor.customerId, input);
    const urgency = items.map((i) => i.price!.urgency).includes("RUSH") ? "RUSH" : items.map((i) => i.price!.urgency).includes("EXPRESS") ? "EXPRESS" : "STANDARD";
    const vatPct = items[0]!.price!.vatPct;
    const totals = computeTotals({ itemSubtotals: items.map((i) => i.lineSubtotal), discount: 0, shipping: method.baseFee, vatPct });
    if (totals.total !== input.expectedTotal) {
      throw new AppError("CONFLICT", "قیمت‌ها به‌روزرسانی شده‌اند. لطفاً مبلغ جدید را بررسی کنید.", { total: totals.total, priceChanged: true });
    }
    const order = await insertOrder(tx, {
      customerId: actor.customerId,
      source: "WEBSITE",
      items,
      urgency,
      priority: urgency === "RUSH" ? "URGENT" : urgency === "EXPRESS" ? "HIGH" : "NORMAL",
      discount: 0,
      deliveryMethodId: method.id,
      shipping: method.baseFee,
      address,
      customerNote: input.note,
      idempotencyKey: `web:${actor.customerId}:${input.idempotencyKey}`,
    });
    await tx.db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    return order;
  });
}

// ── Manual order registration (sales / phone) ───────────────────────────────

export interface ManualItemInput {
  productId?: string | null;
  quantity: number;
  selections?: Selections;
  urgency?: UrgencyLevel;
  /** Custom line (no catalog product) or overridden price. */
  title?: string;
  lineSubtotal?: number;
  workflowTemplateCode?: string;
  note?: string;
}

export async function createManualOrder(
  ctx: Ctx,
  input: {
    customerId: string;
    items: ManualItemInput[];
    priority?: OrderPriority;
    discount?: number;
    deliveryMethodId?: string | null;
    address?: AddressSnapshot | null;
    customerNote?: string | null;
    internalNote?: string | null;
    source?: "SALES" | "PHONE";
    confirm?: boolean;
    idempotencyKey?: string;
  },
) {
  assertCan(ctx, "order.create");
  if ((input.discount ?? 0) > 0 || input.items.some((i) => i.lineSubtotal != null)) assertCan(ctx, "order.price.override");
  return inTx(ctx, async (tx) => {
    const [customer] = await tx.db.select().from(customers).where(eq(customers.id, input.customerId));
    if (!customer) throw notFound("مشتری");
    const items: NewItem[] = [];
    for (const it of input.items) {
      if (it.productId) {
        const [product] = await tx.db.select().from(products).where(eq(products.id, it.productId));
        if (!product) throw notFound("محصول");
        const price = await priceProduct(tx.db, { productId: it.productId, quantity: it.quantity, selections: it.selections ?? {}, urgency: it.urgency ?? "STANDARD", customerId: customer.id });
        items.push({
          productId: product.id,
          title: it.title ?? product.name,
          quantity: it.quantity,
          unitLabel: product.unitLabel,
          selections: it.selections ?? {},
          price,
          lineSubtotal: it.lineSubtotal ?? price.subtotal,
          costTotal: price.costTotal,
          isPriceOverridden: it.lineSubtotal != null && it.lineSubtotal !== price.subtotal,
          workflowTemplateCode: await workflowFor(tx, product.id, price.method),
          needsDesign: price.flags.includes("NEEDS_DESIGN"),
          artworkFileIds: [],
          note: it.note,
        });
      } else {
        if (!it.title || it.lineSubtotal == null || !it.workflowTemplateCode) throw validation("برای قلم سفارشی عنوان، مبلغ و گردش‌کار لازم است.");
        items.push({ productId: null, title: it.title, quantity: it.quantity, unitLabel: "عدد", selections: {}, price: null, lineSubtotal: it.lineSubtotal, costTotal: 0, isPriceOverridden: true, workflowTemplateCode: it.workflowTemplateCode, needsDesign: false, artworkFileIds: [], note: it.note });
      }
    }
    let shipping = 0;
    let address: AddressSnapshot | null = input.address ?? null;
    if (input.deliveryMethodId) {
      const snap = await deliverySnapshot(tx, customer.id, { deliveryMethodId: input.deliveryMethodId, address: input.address });
      shipping = snap.method.baseFee;
      address = snap.address;
    }
    const order = await insertOrder(tx, {
      customerId: customer.id,
      source: input.source ?? "SALES",
      items,
      urgency: items.find((i) => i.price)?.price?.urgency ?? "STANDARD",
      priority: input.priority ?? "NORMAL",
      discount: input.discount ?? 0,
      deliveryMethodId: input.deliveryMethodId ?? null,
      shipping,
      address,
      customerNote: input.customerNote,
      internalNote: input.internalNote,
      idempotencyKey: input.idempotencyKey ? `staff:${input.idempotencyKey}` : null,
    });
    await audit(tx, { action: "order.create", entityType: "order", entityId: order.id, after: { number: order.number, total: order.total, overridden: items.filter((i) => i.isPriceOverridden).length } });
    if (input.confirm) await confirmOrder(tx, order.id);
    return order;
  });
}

/** Used by the quote service: converts accepted quote lines (price locked at quote time). */
export async function createOrderFromQuoteItems(ctx: Ctx, input: Parameters<typeof insertOrder>[1]) {
  return insertOrder(ctx, input);
}

export async function resolveWorkflowCode(ctx: Ctx, productId: string, method: string) {
  return workflowFor(ctx, productId, method);
}

// ── Confirmation → materials + production release ───────────────────────────

/**
 * Confirms an order: computes due date, creates material requirements and
 * reserves stock (shortages go to procurement in parallel), and releases each
 * item's workflow into production.
 */
export async function confirmOrder(ctx: Ctx, orderId: string) {
  if (ctx.actor.kind !== "system") assertCan(ctx, "order.edit");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw notFound("سفارش");
    if (o.status !== "PENDING_REVIEW") throw invalidState("فقط سفارش در انتظار بررسی قابل تأیید است.");
    const items = await tx.db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "ACTIVE")));
    const leadDays = Math.max(1, ...items.map((i) => (i.priceSnapshot as PriceBreakdown | null)?.leadDays ?? 3));
    const cal = await workCalendar(tx.db);
    const dayMinutes = cal.endMinute - cal.startMinute;
    const dueDate = o.dueDate ?? addWorkingMinutes(cal, new Date(), leadDays * dayMinutes);
    await tx.db.update(orders).set({ status: "CONFIRMED", confirmedAt: new Date(), dueDate }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "ORDER", type: "CONFIRMED", from: o.status, to: "CONFIRMED", message: "سفارش تأیید شد و وارد برنامه تولید شد", visibleToCustomer: true });

    for (const item of items) {
      const snap = item.priceSnapshot as PriceBreakdown | null;
      const reqs = await createRequirements(tx, orderId, item.id, snap?.materials ?? []);
      for (const r of reqs) await reserveRequirement(tx, r.id);
      await releaseItem(tx, item.id);
    }
    await emit(tx, "OrderConfirmed", { type: "order", id: orderId }, { orderId });
    await syncOrder(tx, orderId);
    return { id: orderId, dueDate };
  });
}

// ── Cancellation, hold, overrides ───────────────────────────────────────────

async function productionHasStarted(ctx: Ctx, orderId: string) {
  const [row] = await ctx.db
    .select({ id: productionTasks.id })
    .from(productionTasks)
    .where(
      and(
        eq(productionTasks.orderId, orderId),
        sql`${productionTasks.gate} IS NULL`,
        notInArray(productionTasks.stepTypeCode, ["DESIGN", "PREPRESS"]),
        inArray(productionTasks.status, ["IN_PROGRESS", "PAUSED", "COMPLETED", "BLOCKED"]),
      ),
    )
    .limit(1);
  return !!row;
}

/**
 * Cancels an order. Before production starts this is a normal action; after
 * production has started it requires production.override (costs are sunk,
 * issued material stays issued and must be returned or written off).
 */
export async function cancelOrder(ctx: Ctx, orderId: string, reason: string) {
  if (!reason.trim()) throw validation("دلیل لغو را بنویسید.");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw notFound("سفارش");
    if (tx.actor.kind === "customer") {
      if (o.customerId !== tx.actor.customerId) throw notFound("سفارش");
      if (o.status !== "PENDING_REVIEW" || o.paidAmount > 0) throw invalidState("این سفارش دیگر قابل لغو آنلاین نیست. با پشتیبانی تماس بگیرید.");
    } else {
      assertCan(tx, "order.cancel");
    }
    if (["CANCELLED", "COMPLETED"].includes(o.status)) throw invalidState("این سفارش قابل لغو نیست.");
    const started = await productionHasStarted(tx, orderId);
    if (started && !can(tx, "production.override")) throw forbidden("تولید این سفارش شروع شده است؛ لغو آن فقط توسط مدیر ممکن است.");

    // Stop production
    const running = await tx.db.select({ id: productionTasks.id }).from(productionTasks).where(and(eq(productionTasks.orderId, orderId), eq(productionTasks.status, "IN_PROGRESS")));
    if (running.length) {
      await tx.db.update(taskTimeLogs).set({ endedAt: new Date(), endReason: "CANCEL" }).where(and(inArray(taskTimeLogs.taskId, running.map((r) => r.id)), sql`${taskTimeLogs.endedAt} IS NULL`));
    }
    await tx.db
      .update(productionTasks)
      .set({ status: "CANCELLED", completedAt: new Date() })
      .where(and(eq(productionTasks.orderId, orderId), notInArray(productionTasks.status, ["COMPLETED", "SKIPPED", "CANCELLED"])));
    await tx.db.update(productionJobs).set({ status: "CANCELLED" }).where(eq(productionJobs.orderId, orderId));
    await tx.db.update(orderItems).set({ productionStatus: "CANCELLED" }).where(eq(orderItems.orderId, orderId));

    // Free reserved stock (issued stock stays on the floor for return / write-off)
    const reqs = await tx.db.select({ id: materialRequirements.id }).from(materialRequirements).where(eq(materialRequirements.orderId, orderId));
    for (const r of reqs) await releaseRequirement(tx, r.id, `لغو سفارش: ${reason}`);

    await tx.db.update(orders).set({ status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "ORDER", type: "CANCELLED", from: o.status, to: "CANCELLED", message: `سفارش لغو شد: ${reason}`, visibleToCustomer: true });
    await audit(tx, { action: "order.cancel", entityType: "order", entityId: orderId, before: { status: o.status }, after: { status: "CANCELLED", productionStarted: started, paid: o.paidAmount - o.refundedAmount }, reason });
    await emit(tx, "OrderCancelled", { type: "order", id: orderId }, { orderId, reason });
    await recomputeOrder(tx, orderId);
    return { refundDue: Math.max(0, o.paidAmount - o.refundedAmount), productionStarted: started };
  });
}

export async function holdOrder(ctx: Ctx, orderId: string, reason: string) {
  assertCan(ctx, "order.edit");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw notFound("سفارش");
    if (!["CONFIRMED", "IN_PROGRESS", "READY", "PENDING_REVIEW"].includes(o.status)) throw invalidState("این سفارش قابل توقف نیست.");
    await tx.db.update(orders).set({ status: "ON_HOLD", internalNote: [o.internalNote, `توقف: ${reason}`].filter(Boolean).join("\n") }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "ORDER", type: "HOLD", from: o.status, to: "ON_HOLD", message: reason });
    await audit(tx, { action: "order.hold", entityType: "order", entityId: orderId, before: { status: o.status }, after: { status: "ON_HOLD" }, reason });
  });
}

export async function resumeOrder(ctx: Ctx, orderId: string) {
  assertCan(ctx, "order.edit");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o || o.status !== "ON_HOLD") throw invalidState("سفارش متوقف نیست.");
    const [job] = await tx.db.select({ id: productionJobs.id }).from(productionJobs).where(eq(productionJobs.orderId, orderId)).limit(1);
    const to = job ? "CONFIRMED" : "PENDING_REVIEW";
    await tx.db.update(orders).set({ status: to }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "ORDER", type: "RESUMED", from: "ON_HOLD", to });
    await audit(tx, { action: "order.resume", entityType: "order", entityId: orderId, before: { status: "ON_HOLD" }, after: { status: to } });
    await syncOrder(tx, orderId);
  });
}

export async function overrideItemPrice(ctx: Ctx, itemId: string, lineSubtotal: number, reason: string) {
  assertCan(ctx, "order.price.override");
  if (!reason.trim()) throw validation("دلیل تغییر قیمت الزامی است.");
  if (!Number.isInteger(lineSubtotal) || lineSubtotal < 0) throw validation("مبلغ نامعتبر است.");
  return inTx(ctx, async (tx) => {
    const [item] = await tx.db.select().from(orderItems).where(eq(orderItems.id, itemId)).for("update");
    if (!item) throw notFound("ردیف سفارش");
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, item.orderId)).for("update");
    if (["COMPLETED", "CANCELLED"].includes(o!.status)) throw invalidState("سفارش بسته شده است.");
    await tx.db.update(orderItems).set({ lineSubtotal, isPriceOverridden: true }).where(eq(orderItems.id, itemId));
    const totals = await recalcOrderTotals(tx, item.orderId);
    await bumpOrderVersion(tx, item.orderId);
    await audit(tx, { action: "order.price.override", entityType: "order_item", entityId: itemId, before: { lineSubtotal: item.lineSubtotal }, after: { lineSubtotal, orderTotal: totals.total }, reason });
    await orderEvent(tx, { orderId: item.orderId, orderItemId: itemId, domain: "ORDER", type: "PRICE_OVERRIDE", message: `قیمت «${item.title}» تغییر کرد: ${reason}` });
    await recomputeOrder(tx, item.orderId);
    return totals;
  });
}

export async function setOrderDiscount(ctx: Ctx, orderId: string, discount: number, reason: string) {
  assertCan(ctx, "order.price.override");
  if (!reason.trim()) throw validation("دلیل تخفیف الزامی است.");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw notFound("سفارش");
    if (["COMPLETED", "CANCELLED"].includes(o.status)) throw invalidState("سفارش بسته شده است.");
    if (!Number.isInteger(discount) || discount < 0 || discount > o.subtotal) throw validation("مبلغ تخفیف نامعتبر است.");
    await tx.db.update(orders).set({ discountAmount: discount }).where(eq(orders.id, orderId));
    const totals = await recalcOrderTotals(tx, orderId);
    await audit(tx, { action: "order.discount", entityType: "order", entityId: orderId, before: { discount: o.discountAmount, total: o.total }, after: { discount, total: totals.total }, reason });
    await recomputeOrder(tx, orderId);
    return totals;
  });
}

export async function setOrderPriority(ctx: Ctx, orderId: string, priority: OrderPriority, reason?: string) {
  assertCan(ctx, "order.priority.change");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw notFound("سفارش");
    const score = PRIORITY_SCORE[priority];
    await tx.db.update(orders).set({ priority }).where(eq(orders.id, orderId));
    await tx.db.update(productionJobs).set({ priority: score }).where(eq(productionJobs.orderId, orderId));
    await tx.db.update(productionTasks).set({ priority: score }).where(and(eq(productionTasks.orderId, orderId), inArray(productionTasks.status, ["PENDING", "READY", "PAUSED", "BLOCKED"])));
    await audit(tx, { action: "order.priority", entityType: "order", entityId: orderId, before: { priority: o.priority }, after: { priority }, reason });
    await orderEvent(tx, { orderId, domain: "ORDER", type: "PRIORITY", from: o.priority, to: priority, message: reason ?? null });
  });
}

export async function setDepositOverride(ctx: Ctx, orderId: string, input: { override: boolean; depositPct?: number; reason: string }) {
  assertCan(ctx, "order.state.force");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw notFound("سفارش");
    const patch = { paymentGateOverride: input.override, depositPct: input.depositPct ?? o.depositPct };
    await tx.db.update(orders).set(patch).where(eq(orders.id, orderId));
    await audit(tx, { action: "order.deposit_override", entityType: "order", entityId: orderId, before: { paymentGateOverride: o.paymentGateOverride, depositPct: o.depositPct }, after: patch, reason: input.reason });
    await syncOrder(tx, orderId);
  });
}

const FORCEABLE: Order["status"][] = ["PENDING_REVIEW", "CONFIRMED", "IN_PROGRESS", "ON_HOLD", "READY", "COMPLETED"];

/** Manager escape hatch for data corrections. Never used for cancellation (use cancelOrder). */
export async function forceOrderStatus(ctx: Ctx, orderId: string, status: Order["status"], reason: string) {
  assertCan(ctx, "order.state.force");
  if (!FORCEABLE.includes(status)) throw validation("این وضعیت را نمی‌توان به‌صورت دستی تنظیم کرد.");
  if (!reason.trim()) throw validation("دلیل الزامی است.");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!o) throw notFound("سفارش");
    if (o.status === "CANCELLED") throw invalidState("سفارش لغوشده قابل بازگشت نیست.");
    await tx.db.update(orders).set({ status, completedAt: status === "COMPLETED" ? new Date() : o.completedAt }).where(eq(orders.id, orderId));
    await orderEvent(tx, { orderId, domain: "ORDER", type: "FORCED", from: o.status, to: status, message: reason });
    await audit(tx, { action: "order.state.force", entityType: "order", entityId: orderId, before: { status: o.status }, after: { status }, reason });
  });
}

// ── Change requests (customer modifications after confirmation) ─────────────

export async function createChangeRequest(ctx: Ctx, orderId: string, input: { orderItemId?: string | null; description: string }) {
  if (!input.description.trim()) throw validation("توضیح تغییر را بنویسید.");
  return inTx(ctx, async (tx) => {
    const [o] = await tx.db.select().from(orders).where(eq(orders.id, orderId));
    if (!o) throw notFound("سفارش");
    if (tx.actor.kind === "customer") {
      if (o.customerId !== tx.actor.customerId) throw notFound("سفارش");
    } else assertCan(tx, "order.edit");
    if (["COMPLETED", "CANCELLED"].includes(o.status)) throw invalidState("سفارش بسته شده است.");
    const [cr] = await tx.db.insert(orderChangeRequests).values({ orderId, orderItemId: input.orderItemId ?? null, description: input.description, requestedBy: actorUserId(tx) }).returning();
    const started = await productionHasStarted(tx, orderId);
    await orderEvent(tx, { orderId, domain: "ORDER", type: "CHANGE_REQUESTED", message: `${started ? "(پس از شروع تولید) " : ""}${input.description}`, visibleToCustomer: true });
    return { ...cr!, productionStarted: started };
  });
}

export async function resolveChangeRequest(ctx: Ctx, id: string, input: { approve: boolean; resolution: string }) {
  assertCan(ctx, "order.edit");
  return inTx(ctx, async (tx) => {
    const [cr] = await tx.db.select().from(orderChangeRequests).where(eq(orderChangeRequests.id, id)).for("update");
    if (!cr) throw notFound("درخواست تغییر");
    if (cr.status !== "PENDING") throw invalidState("این درخواست قبلاً بررسی شده است.");
    await tx.db
      .update(orderChangeRequests)
      .set({ status: input.approve ? "APPROVED" : "REJECTED", resolution: input.resolution, resolvedBy: actorUserId(tx), resolvedAt: new Date() })
      .where(eq(orderChangeRequests.id, id));
    await orderEvent(tx, { orderId: cr.orderId, domain: "ORDER", type: input.approve ? "CHANGE_APPROVED" : "CHANGE_REJECTED", message: input.resolution, visibleToCustomer: true });
    await audit(tx, { action: "order.change_request", entityType: "order_change_request", entityId: id, after: input });
  });
}

/** Adds a past order's items to the cart, priced with today's rules. */
export async function reorderToCart(ctx: Ctx, orderId: string) {
  const actor = requireCustomer(ctx);
  const [o] = await ctx.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerId, actor.customerId)));
  if (!o) throw notFound("سفارش");
  const items = await ctx.db.select().from(orderItems).where(and(eq(orderItems.orderId, orderId), eq(orderItems.status, "ACTIVE")));
  const { getOrCreateCart, addCartItem } = await import("./cart");
  const cart = await getOrCreateCart(ctx);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const it of items) {
    if (!it.productId) {
      skipped.push(it.title);
      continue;
    }
    try {
      await addCartItem(ctx, cart, { productId: it.productId, quantity: it.quantity, selections: it.selections, urgency: (it.priceSnapshot as PriceBreakdown | null)?.urgency ?? "STANDARD" });
      added.push(it.title);
    } catch {
      skipped.push(it.title);
    }
  }
  return { added, skipped };
}

export async function bumpVersion(ctx: Ctx, orderId: string) {
  await bumpOrderVersion(ctx, orderId);
}

export { recalcOrderTotals };
