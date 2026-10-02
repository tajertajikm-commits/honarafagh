import { and, eq, inArray, sql } from "drizzle-orm";
import { addresses, artworkFiles, cartItems, customers, deliveryMethods, fileObjects, orderItems, orders, products, type AddressSnapshot } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx, requireCustomer } from "@/server/core/context";
import { AppError, conflict, forbidden, isUniqueViolation, notFound, validation } from "@/server/core/errors";
import { emit } from "@/server/events/outbox";
import { priceProduct } from "@/server/modules/pricing/service";
import type { PriceBreakdown } from "@/server/modules/pricing/types";
import type { ProductionType } from "@/server/modules/workflow/stations";
import { findCart } from "./cart";
import { computeTotals, nextOrderCode, orderEvent, type Order } from "./state";

/** Files must be the caller's own uploads (prevents attaching someone else's file). */
export async function assertOwnFiles(ctx: Ctx, fileIds: readonly string[], purposes: readonly string[] = ["ARTWORK"]) {
  if (fileIds.length === 0) return;
  const rows = await ctx.db.select({ id: fileObjects.id, uploadedBy: fileObjects.uploadedBy, purpose: fileObjects.purpose }).from(fileObjects).where(inArray(fileObjects.id, [...fileIds]));
  const me = actorUserId(ctx);
  if (!me || rows.length !== new Set(fileIds).size || rows.some((r) => !purposes.includes(r.purpose) || r.uploadedBy !== me)) throw forbidden("فایل انتخاب‌شده معتبر نیست.");
}

async function addCustomerArtwork(ctx: Ctx, orderId: string, fileIds: readonly string[]) {
  let versionNo = 0;
  for (const fileId of fileIds) await ctx.db.insert(artworkFiles).values({ orderId, versionNo: ++versionNo, source: "CUSTOMER", fileId, uploadedBy: actorUserId(ctx) });
}

const initialArtworkStatus = (needsDesign: boolean, hasFiles: boolean): Order["artworkStatus"] => (needsDesign ? "DESIGN_REQUESTED" : hasFiles ? "AWAITING_REVIEW" : "AWAITING_FILE");

// ── Custom order request ────────────────────────────────────────────────────

export interface CustomOrderInput {
  /** Staff only: the customer the order is for. */
  customerId?: string;
  productionType: ProductionType;
  title: string;
  description?: string | null;
  quantity: number;
  dimensions?: string | null;
  material?: string | null;
  colors?: string | null;
  finishing?: string | null;
  needsDesign: boolean;
  artworkFileIds?: string[];
  requestedDeadline?: Date | null;
  note?: string | null;
  idempotencyKey: string;
}

/**
 * A custom printing request. It always starts WAITING_APPROVAL; the price is
 * set by the printing house when it is reviewed.
 */
export async function createCustomOrder(ctx: Ctx, input: CustomOrderInput): Promise<Order> {
  let customerId: string;
  if (ctx.actor.kind === "customer") customerId = ctx.actor.customerId;
  else {
    assertCan(ctx, "order.create");
    if (!input.customerId) throw validation("مشتری را انتخاب کنید.");
    customerId = input.customerId;
  }
  const title = input.title.trim();
  if (title.length < 3) throw validation("عنوان سفارش را بنویسید.");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw validation("تیراژ نامعتبر است.");
  const fileIds = input.artworkFileIds ?? [];
  if (ctx.actor.kind === "customer") await assertOwnFiles(ctx, fileIds);
  if (input.requestedDeadline && input.requestedDeadline.getTime() < Date.now() - 86_400_000) throw validation("تاریخ تحویل درخواستی گذشته است.");
  return inTx(ctx, async (tx) => {
    const [c] = await tx.db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId));
    if (!c) throw notFound("مشتری");
    const code = await nextOrderCode(tx, customerId, input.productionType);
    let order: Order;
    try {
      [order] = (await tx.db
        .insert(orders)
        .values({
          code,
          customerId,
          kind: "CUSTOM",
          productionType: input.productionType,
          artworkStatus: initialArtworkStatus(input.needsDesign, fileIds.length > 0),
          title,
          description: input.description?.trim() || null,
          quantity: input.quantity,
          dimensions: input.dimensions?.trim() || null,
          material: input.material?.trim() || null,
          colors: input.colors?.trim() || null,
          finishing: input.finishing?.trim() || null,
          needsDesign: input.needsDesign,
          requestedDeadline: input.requestedDeadline ?? null,
          customerNote: input.note?.trim() || null,
          createdBy: actorUserId(tx),
          idempotencyKey: `custom:${customerId}:${input.idempotencyKey}`,
        })
        .returning()) as [Order];
    } catch (err) {
      if (isUniqueViolation(err, "orders_idempotency_uq")) throw conflict("این سفارش قبلاً ثبت شده است.", { duplicate: true });
      throw err;
    }
    await addCustomerArtwork(tx, order.id, fileIds);
    await orderEvent(tx, { orderId: order.id, domain: "ORDER", type: "SUBMITTED", message: "سفارش ثبت شد و در انتظار تأیید است", visibleToCustomer: true });
    await emit(tx, "OrderSubmitted", { type: "order", id: order.id }, { orderId: order.id });
    return order;
  });
}

// ── Store checkout ──────────────────────────────────────────────────────────

export interface CheckoutInput {
  deliveryMethodId: string;
  addressId?: string | null;
  address?: AddressSnapshot | null;
  note?: string | null;
  expectedTotal: number;
  idempotencyKey: string;
}

async function deliverySnapshot(ctx: Ctx, customerId: string, input: { deliveryMethodId: string; addressId?: string | null; address?: AddressSnapshot | null }) {
  const [method] = await ctx.db.select().from(deliveryMethods).where(and(eq(deliveryMethods.id, input.deliveryMethodId), eq(deliveryMethods.isActive, true)));
  if (!method) throw validation("روش ارسال نامعتبر است.");
  let address: AddressSnapshot | null = null;
  if (method.method !== "PICKUP" && method.method !== "CUSTOMER_COURIER") {
    if (input.addressId) {
      const [a] = await ctx.db.select().from(addresses).where(and(eq(addresses.id, input.addressId), eq(addresses.customerId, customerId)));
      if (!a) throw validation("آدرس انتخاب‌شده معتبر نیست.");
      address = { title: a.title, province: a.province, city: a.city, line: a.line, postalCode: a.postalCode, recipientName: a.recipientName, recipientPhone: a.recipientPhone };
    } else if (input.address) address = input.address;
    else throw validation("آدرس ارسال را وارد کنید.");
  }
  return { method, address };
}

interface Line {
  productId: string;
  title: string;
  quantity: number;
  unitLabel: string;
  selections: Record<string, string | number | boolean>;
  price: PriceBreakdown;
  needsDesign: boolean;
  artworkFileIds: string[];
  note: string | null;
}

/**
 * Turns the cart into orders. Each order has one production type, so a cart
 * mixing Digital and Offset items becomes two orders (the delivery fee is
 * charged once). Store orders are priced by the pricing engine and still pass
 * the approval gate, where the approver confirms the production stations.
 */
export async function checkout(ctx: Ctx, input: CheckoutInput): Promise<{ orders: Pick<Order, "id" | "code" | "total" | "productionType">[] }> {
  const actor = requireCustomer(ctx);
  return inTx(ctx, async (tx) => {
    const cart = await findCart(tx);
    if (!cart) throw validation("سبد خرید خالی است.");
    await tx.db.execute(sql`SELECT id FROM carts WHERE id = ${cart.id} FOR UPDATE`);
    const rows = await tx.db.select({ item: cartItems, product: products }).from(cartItems).innerJoin(products, eq(products.id, cartItems.productId)).where(eq(cartItems.cartId, cart.id));
    if (rows.length === 0) throw validation("سبد خرید خالی است.");
    const lines: Line[] = [];
    for (const { item, product } of rows) {
      const price = await priceProduct(tx.db, { productId: item.productId, quantity: item.quantity, selections: item.selections, urgency: item.urgency, customerId: actor.customerId });
      lines.push({ productId: product.id, title: product.name, quantity: item.quantity, unitLabel: product.unitLabel, selections: item.selections, price, needsDesign: price.flags.includes("NEEDS_DESIGN") || item.needsDesign, artworkFileIds: item.artworkFileIds, note: item.note });
    }
    const { method, address } = await deliverySnapshot(tx, actor.customerId, input);
    const groups = new Map<ProductionType, Line[]>();
    for (const l of lines) {
      const type = l.price.method as ProductionType;
      groups.set(type, [...(groups.get(type) ?? []), l]);
    }
    const plans = [...groups.entries()].map(([type, ls], i) => {
      const vatPct = ls[0]!.price.vatPct;
      const shipping = i === 0 ? method.baseFee : 0;
      return { type, lines: ls, vatPct, shipping, totals: computeTotals({ itemSubtotals: ls.map((l) => l.price.subtotal), discount: 0, shipping, vatPct }) };
    });
    const grandTotal = plans.reduce((s, p) => s + p.totals.total, 0);
    if (grandTotal !== input.expectedTotal) throw new AppError("CONFLICT", "قیمت‌ها به‌روزرسانی شده‌اند. لطفاً مبلغ جدید را بررسی کنید.", { total: grandTotal, priceChanged: true });

    const created: Order[] = [];
    for (const [pi, p] of plans.entries()) {
      const code = await nextOrderCode(tx, actor.customerId, p.type);
      const needsDesign = p.lines.some((l) => l.needsDesign);
      const fileIds = p.lines.flatMap((l) => l.artworkFileIds);
      const single = p.lines.length === 1 ? p.lines[0]! : null;
      let order: Order;
      try {
        [order] = (await tx.db
          .insert(orders)
          .values({
            code,
            customerId: actor.customerId,
            kind: "STORE",
            productionType: p.type,
            artworkStatus: initialArtworkStatus(needsDesign, fileIds.length > 0),
            title: p.lines.map((l) => l.title).join("، "),
            quantity: single?.quantity ?? null,
            needsDesign,
            customerNote: input.note?.trim() || null,
            subtotal: p.totals.subtotal,
            shippingAmount: p.shipping,
            vatPct: p.vatPct,
            vatAmount: p.totals.vatAmount,
            total: p.totals.total,
            pricedAt: new Date(),
            deliveryMethodId: method.id,
            shippingAddress: address,
            createdBy: actorUserId(tx),
            idempotencyKey: `web:${actor.customerId}:${input.idempotencyKey}:${pi}`,
          })
          .returning()) as [Order];
      } catch (err) {
        if (isUniqueViolation(err, "orders_idempotency_uq")) throw conflict("این سفارش قبلاً ثبت شده است.", { duplicate: true });
        throw err;
      }
      for (const [i, l] of p.lines.entries()) {
        await tx.db.insert(orderItems).values({
          orderId: order.id,
          lineNo: i + 1,
          productId: l.productId,
          title: l.title,
          quantity: l.quantity,
          unitLabel: l.unitLabel,
          selections: l.selections,
          priceSnapshot: l.price,
          pricingVersionId: l.price.ruleVersionId,
          lineSubtotal: l.price.subtotal,
          note: l.note,
        });
      }
      await addCustomerArtwork(tx, order.id, fileIds);
      await orderEvent(tx, { orderId: order.id, domain: "ORDER", type: "SUBMITTED", message: "سفارش ثبت شد و در انتظار تأیید است", visibleToCustomer: true });
      await emit(tx, "OrderSubmitted", { type: "order", id: order.id }, { orderId: order.id });
      created.push(order);
    }
    await tx.db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    return { orders: created.map((o) => ({ id: o.id, code: o.code, total: o.total, productionType: o.productionType })) };
  });
}
