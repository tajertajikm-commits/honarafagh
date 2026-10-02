import { z } from "zod";
import { forbidden } from "@/server/core/errors";
import { approveOrder, cancelOrder, customerReply, rejectOrder, requestInfo, setOrderPrice } from "@/server/modules/orders/approval";
import { completeDesign, reviewArtwork, startDesign, uploadArtwork } from "@/server/modules/orders/artwork";
import { createCustomOrder } from "@/server/modules/orders/create";
import { trackOrder } from "@/server/modules/orders/queries";
import { addSupplierQuote, decidePaperSupplier, markPaperReceived, removeSupplierQuote, saveLithoJob } from "@/server/modules/offset/service";
import { myWork, stationQueues } from "@/server/modules/queues/service";
import { dispatchOrder, markDelivered } from "@/server/modules/shipping/service";
import { assignMachine, assignStep, completeStep, decideQuality, setPriority, startStep } from "@/server/modules/workflow/engine";
import { api } from "../router";
import { dateLike, idempotencyKey, note, phone, positiveRial, rial, uuid } from "./schemas";

const text = (max: number) => z.string().trim().max(max);
const optText = (max: number) => text(max).nullable().optional();
const reason = text(1000).min(3);
const stepKey = z.string().regex(/^[DO]_[A-Z_]+$/);

export const orderRoutes = [
  // ── Customer & staff: create and follow up ──────────────────────────────
  api.post(
    "orders/custom",
    {
      auth: "any",
      body: z.object({
        customerId: uuid.optional(),
        productionType: z.enum(["DIGITAL", "OFFSET"]),
        title: text(160).min(3),
        description: optText(3000),
        quantity: z.number().int().positive().max(10_000_000),
        dimensions: optText(120),
        material: optText(160),
        colors: optText(120),
        finishing: optText(300),
        needsDesign: z.boolean(),
        artworkFileIds: z.array(uuid).max(10).optional(),
        requestedDeadline: dateLike.nullable().optional(),
        note: optText(2000),
        idempotencyKey,
      }),
    },
    async ({ ctx, body }) => {
      if (ctx.actor.kind === "anonymous") throw forbidden("برای ثبت سفارش وارد حساب کاربری شوید.");
      const o = await createCustomOrder(ctx, body);
      return { id: o.id, code: o.code };
    },
  ),
  api.post("orders/:id/reply", { auth: "customer", body: z.object({ message: text(3000).min(2), fileIds: z.array(uuid).max(10).optional() }) }, async ({ ctx, params, body }) => customerReply(ctx, params.id!, body)),
  api.post("orders/:id/cancel", { auth: "any", body: z.object({ reason }) }, async ({ ctx, params, body }) => cancelOrder(ctx, params.id!, body.reason)),
  api.post("orders/:id/artwork", { auth: "any", body: z.object({ fileIds: z.array(uuid).min(1).max(10), note }) }, async ({ ctx, params, body }) => uploadArtwork(ctx, params.id!, body)),
  api.get("track", { auth: "public", query: z.object({ code: z.string().max(24), phone }) }, async ({ ctx, query }) => trackOrder(ctx, query.code, query.phone)),

  // ── Approval gate ───────────────────────────────────────────────────────
  api.post(
    "orders/:id/approve",
    {
      auth: "staff",
      body: z.object({
        steps: z.array(stepKey).max(20),
        notes: optText(2000),
        price: z.object({ amount: positiveRial, discount: rial.optional() }).nullable().optional(),
        designerId: uuid.nullable().optional(),
      }),
    },
    async ({ ctx, params, body }) => approveOrder(ctx, params.id!, body),
  ),
  api.post("orders/:id/reject", { auth: "staff", body: z.object({ reason, notes: optText(2000) }) }, async ({ ctx, params, body }) => rejectOrder(ctx, params.id!, body)),
  api.post("orders/:id/request-info", { auth: "staff", body: z.object({ notes: reason }) }, async ({ ctx, params, body }) => requestInfo(ctx, params.id!, body)),
  api.post("orders/:id/price", { auth: "staff", body: z.object({ amount: positiveRial.optional(), discount: rial, vatPct: z.number().int().min(0).max(30).optional() }) }, async ({ ctx, params, body }) => setOrderPrice(ctx, params.id!, body)),
  api.post("orders/:id/priority", { auth: "staff", body: z.object({ isPriority: z.boolean(), reason, charge: rial.nullable().optional() }) }, async ({ ctx, params, body }) => setPriority(ctx, params.id!, body)),

  // ── Artwork & design ────────────────────────────────────────────────────
  api.post("artwork/:id/review", { auth: "staff", body: z.object({ approve: z.boolean(), note: optText(1000) }) }, async ({ ctx, params, body }) => reviewArtwork(ctx, params.id!, body)),
  api.post("orders/:id/design/start", { auth: "staff" }, async ({ ctx, params }) => startDesign(ctx, params.id!)),
  api.post("orders/:id/design/complete", { auth: "staff", body: z.object({ note: optText(1000) }) }, async ({ ctx, params, body }) => completeDesign(ctx, params.id!, body)),

  // ── Production steps ────────────────────────────────────────────────────
  api.post("steps/:id/start", { auth: "staff" }, async ({ ctx, params }) => startStep(ctx, params.id!)),
  api.post(
    "steps/:id/complete",
    { auth: "staff", body: z.object({ note: optText(1000), materialId: uuid.nullable().optional(), quantity: z.number().min(0).max(1_000_000).nullable().optional(), paperNote: optText(300) }) },
    async ({ ctx, params, body }) => completeStep(ctx, params.id!, body),
  ),
  api.post(
    "steps/:id/quality",
    { auth: "staff", body: z.object({ approve: z.boolean(), notes: optText(1000), reason: optText(1000), returnTo: stepKey.nullable().optional() }) },
    async ({ ctx, params, body }) => decideQuality(ctx, params.id!, body),
  ),
  api.post("steps/:id/machine", { auth: "staff", body: z.object({ machineId: uuid }) }, async ({ ctx, params, body }) => assignMachine(ctx, params.id!, body.machineId)),
  api.post("steps/:id/assign", { auth: "staff", body: z.object({ employeeId: uuid.nullable() }) }, async ({ ctx, params, body }) => assignStep(ctx, params.id!, body.employeeId)),
  api.get("queues/digital", { auth: "staff" }, async ({ ctx }) => stationQueues(ctx, "DIGITAL")),
  api.get("queues/offset", { auth: "staff" }, async ({ ctx }) => stationQueues(ctx, "OFFSET")),
  api.get("my-work", { auth: "staff" }, async ({ ctx }) => myWork(ctx)),

  // ── Offset: paper procurement and lithography ───────────────────────────
  api.post("orders/:id/paper-quotes", { auth: "staff", body: z.object({ supplierId: uuid, price: positiveRial, notes: optText(500), quotedAt: dateLike.nullable().optional() }) }, async ({ ctx, params, body }) =>
    addSupplierQuote(ctx, params.id!, body),
  ),
  api.delete("paper-quotes/:id", { auth: "staff" }, async ({ ctx, params }) => removeSupplierQuote(ctx, params.id!)),
  api.post("orders/:id/paper-decision", { auth: "staff", body: z.object({ quoteId: uuid, notes: optText(500) }) }, async ({ ctx, params, body }) => decidePaperSupplier(ctx, params.id!, body)),
  api.post("orders/:id/paper-received", { auth: "staff", body: z.object({ note: optText(500) }) }, async ({ ctx, params, body }) => markPaperReceived(ctx, params.id!, body)),
  api.put(
    "orders/:id/litho",
    {
      auth: "staff",
      body: z.object({
        supplierId: uuid.nullable().optional(),
        status: z.enum(["NOT_ORDERED", "ORDERED", "IN_PROGRESS", "READY", "RECEIVED", "CANCELLED"]),
        sentAt: dateLike.nullable().optional(),
        expectedAt: dateLike.nullable().optional(),
        price: rial.nullable().optional(),
        notes: optText(1000),
      }),
    },
    async ({ ctx, params, body }) => saveLithoJob(ctx, params.id!, body),
  ),

  // ── Shipping ────────────────────────────────────────────────────────────
  api.post(
    "orders/:id/dispatch",
    {
      auth: "staff",
      body: z.object({
        method: z.enum(["COURIER", "POST", "EXTERNAL", "CUSTOMER_COURIER", "PICKUP"]),
        responsibleId: uuid.nullable().optional(),
        carrierName: optText(120),
        trackingCode: optText(80),
        recipientName: optText(120),
        recipientPhone: phone.nullable().optional(),
        notes: optText(1000),
      }),
    },
    async ({ ctx, params, body }) => dispatchOrder(ctx, params.id!, body),
  ),
  api.post("orders/:id/delivered", { auth: "staff", body: z.object({ recipientName: optText(120), note: optText(500) }) }, async ({ ctx, params, body }) => markDelivered(ctx, params.id!, body)),
];
