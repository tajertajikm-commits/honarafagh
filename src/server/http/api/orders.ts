import { z } from "zod";
import { assertCan } from "@/server/core/context";
import { getOrderDetail, listOrders, trackOrder } from "@/server/modules/orders/queries";
import {
  cancelOrder,
  confirmOrder,
  createChangeRequest,
  createManualOrder,
  forceOrderStatus,
  holdOrder,
  overrideItemPrice,
  reorderToCart,
  resolveChangeRequest,
  resumeOrder,
  setDepositOverride,
  setOrderDiscount,
  setOrderPriority,
} from "@/server/modules/orders/service";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { api } from "../router";
import { address, idempotencyKey, note, pagination, phone, reason, rial, selections, urgency, uuid } from "./schemas";

const priority = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);

export const orderRoutes = [
  api.get(
    "orders",
    { auth: "any", query: pagination.extend({ q: z.string().max(80).optional(), status: z.string().max(200).optional(), late: z.enum(["1"]).optional(), customerId: uuid.optional() }) },
    async ({ ctx, query }) =>
      listOrders(ctx, {
        q: query.q,
        status: query.status?.split(",").filter(Boolean) as never,
        late: query.late === "1",
        customerId: ctx.actor.kind === "staff" ? query.customerId : undefined,
        page: query.page,
        pageSize: query.pageSize,
      }),
  ),
  api.get("orders/:id", { auth: "any" }, async ({ ctx, params }) => getOrderDetail(ctx, params.id!)),

  api.get("track", { auth: "public", query: z.object({ number: z.coerce.number().int().positive(), phone }) }, async ({ ctx, query }) => {
    await enforceRateLimit(ctx.db, `track:${ctx.ip ?? "?"}`, 30, 600);
    return trackOrder(ctx, query.number, query.phone);
  }),

  api.post(
    "orders",
    {
      auth: "staff",
      body: z.object({
        customerId: uuid,
        items: z
          .array(
            z.object({
              productId: uuid.optional().nullable(),
              quantity: z.number().int().positive().max(1_000_000),
              selections: selections.optional(),
              urgency: urgency.optional(),
              title: z.string().max(200).optional(),
              lineSubtotal: rial.optional(),
              workflowTemplateCode: z.string().max(48).optional(),
              note: z.string().max(1000).optional(),
            }),
          )
          .min(1)
          .max(30),
        priority: priority.optional(),
        discount: rial.optional(),
        deliveryMethodId: uuid.optional().nullable(),
        address: address.optional().nullable(),
        customerNote: note,
        internalNote: note,
        source: z.enum(["SALES", "PHONE"]).optional(),
        confirm: z.boolean().optional(),
        idempotencyKey: idempotencyKey.optional(),
      }),
    },
    async ({ ctx, body }) => createManualOrder(ctx, body),
  ),

  api.post("orders/:id/confirm", { auth: "staff" }, async ({ ctx, params }) => confirmOrder(ctx, params.id!)),
  api.post("orders/:id/cancel", { auth: "any", body: z.object({ reason }) }, async ({ ctx, params, body }) => cancelOrder(ctx, params.id!, body.reason)),
  api.post("orders/:id/hold", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => holdOrder(ctx, params.id!, body.reason)),
  api.post("orders/:id/resume", { auth: "staff" }, async ({ ctx, params }) => resumeOrder(ctx, params.id!)),
  api.post("orders/:id/priority", { auth: "staff", body: z.object({ priority, reason: z.string().max(500).optional() }) }, async ({ ctx, params, body }) => setOrderPriority(ctx, params.id!, body.priority, body.reason)),
  api.post("orders/:id/discount", { auth: "staff", body: z.object({ discount: rial, reason }) }, async ({ ctx, params, body }) => setOrderDiscount(ctx, params.id!, body.discount, body.reason)),
  api.post("orders/:id/deposit", { auth: "staff", body: z.object({ override: z.boolean(), depositPct: z.number().int().min(0).max(100).optional(), reason }) }, async ({ ctx, params, body }) =>
    setDepositOverride(ctx, params.id!, body),
  ),
  api.post(
    "orders/:id/force-status",
    { auth: "staff", body: z.object({ status: z.enum(["PENDING_REVIEW", "CONFIRMED", "IN_PROGRESS", "ON_HOLD", "READY", "COMPLETED"]), reason }) },
    async ({ ctx, params, body }) => forceOrderStatus(ctx, params.id!, body.status, body.reason),
  ),
  api.post("order-items/:id/price", { auth: "staff", body: z.object({ lineSubtotal: rial, reason }) }, async ({ ctx, params, body }) => overrideItemPrice(ctx, params.id!, body.lineSubtotal, body.reason)),
  api.post("orders/:id/reorder", { auth: "customer" }, async ({ ctx, params }) => reorderToCart(ctx, params.id!)),
  api.post("orders/:id/change-requests", { auth: "any", body: z.object({ orderItemId: uuid.optional().nullable(), description: z.string().trim().min(3).max(2000) }) }, async ({ ctx, params, body }) =>
    createChangeRequest(ctx, params.id!, body),
  ),
  api.post("change-requests/:id/resolve", { auth: "staff", body: z.object({ approve: z.boolean(), resolution: reason }) }, async ({ ctx, params, body }) => {
    assertCan(ctx, "order.edit");
    return resolveChangeRequest(ctx, params.id!, body);
  }),
];
