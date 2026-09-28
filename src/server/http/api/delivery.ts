import { z } from "zod";
import { assignShipment, cancelShipment, completeShipment, createShipment, dispatchShipment, failShipment } from "@/server/modules/delivery/service";
import { api } from "../router";
import { address, dateLike, reason, uuid } from "./schemas";

export const deliveryRoutes = [
  api.post(
    "orders/:id/shipments",
    {
      auth: "staff",
      body: z.object({
        methodId: uuid,
        items: z.array(z.object({ orderItemId: uuid, quantity: z.number().int().positive() })).max(30).optional(),
        assigneeId: uuid.nullable().optional(),
        vehicleId: uuid.nullable().optional(),
        scheduledAt: dateLike.nullable().optional(),
        address: address.nullable().optional(),
        externalProvider: z.string().max(80).nullable().optional(),
        trackingCode: z.string().max(80).nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
      }),
    },
    async ({ ctx, params, body }) => createShipment(ctx, params.id!, body),
  ),
  api.post(
    "shipments/:id/assign",
    { auth: "staff", body: z.object({ assigneeId: uuid.nullable().optional(), vehicleId: uuid.nullable().optional(), scheduledAt: dateLike.nullable().optional(), trackingCode: z.string().max(80).nullable().optional(), externalProvider: z.string().max(80).nullable().optional() }) },
    async ({ ctx, params, body }) => assignShipment(ctx, params.id!, body),
  ),
  api.post("shipments/:id/dispatch", { auth: "staff" }, async ({ ctx, params }) => dispatchShipment(ctx, params.id!)),
  api.post("shipments/:id/complete", { auth: "staff", body: z.object({ recipientName: z.string().trim().min(2).max(120), proofNote: z.string().max(500).nullable().optional(), proofFileId: uuid.nullable().optional() }) }, async ({ ctx, params, body }) =>
    completeShipment(ctx, params.id!, body),
  ),
  api.post("shipments/:id/fail", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => failShipment(ctx, params.id!, body.reason)),
  api.post("shipments/:id/cancel", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => cancelShipment(ctx, params.id!, body.reason)),
];
