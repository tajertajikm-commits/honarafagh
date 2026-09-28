import { z } from "zod";
import { adjustStock, issueRequirement, receiveStock, releaseRequirement, reserveRequirement, returnRequirement, writeOffStock } from "@/server/modules/inventory/service";
import {
  cancelMaterialRequest,
  cancelPurchaseOrder,
  createMaterialRequest,
  createPurchaseOrder,
  receivePurchaseOrder,
  submitPurchaseOrder,
  upsertSupplier,
} from "@/server/modules/procurement/service";
import { syncRequirements } from "@/server/modules/production/engine";
import { assertCan, inTx } from "@/server/core/context";
import { api } from "../router";
import { dateLike, idempotencyKey, qty, reason, uuid } from "./schemas";

export const inventoryRoutes = [
  api.post("inventory/requirements/:id/reserve", { auth: "staff" }, async ({ ctx, params }) => {
    assertCan(ctx, "inventory.reserve");
    return inTx(ctx, async (tx) => {
      const r = await reserveRequirement(tx, params.id!);
      await syncRequirements(tx, [r.id]);
      return r;
    });
  }),
  api.post("inventory/requirements/:id/release", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => {
    assertCan(ctx, "inventory.reserve");
    return inTx(ctx, async (tx) => {
      const r = await releaseRequirement(tx, params.id!, body.reason);
      await syncRequirements(tx, [r.id]);
      return r;
    });
  }),
  api.post("inventory/requirements/:id/issue", { auth: "staff", body: z.object({ quantity: qty, idempotencyKey: idempotencyKey.optional() }) }, async ({ ctx, params, body }) =>
    inTx(ctx, async (tx) => {
      const r = await issueRequirement(tx, params.id!, body.quantity, { idempotencyKey: body.idempotencyKey });
      await syncRequirements(tx, [r.id]);
      return r;
    }),
  ),
  api.post("inventory/requirements/:id/return", { auth: "staff", body: z.object({ quantity: qty }) }, async ({ ctx, params, body }) => returnRequirement(ctx, params.id!, body.quantity)),
  api.post(
    "inventory/receive",
    { auth: "staff", body: z.object({ materialId: uuid, locationId: uuid, quantity: qty, unitCost: z.number().min(0).optional().nullable(), reason: z.string().max(300).optional(), idempotencyKey: idempotencyKey.optional() }) },
    async ({ ctx, body }) =>
      inTx(ctx, async (tx) => {
        const r = await receiveStock(tx, body);
        await syncRequirements(tx, r.allocatedRequirementIds);
        return r;
      }),
  ),
  api.post("inventory/adjust", { auth: "staff", body: z.object({ materialId: uuid, locationId: uuid, delta: z.number().finite().refine((n) => n !== 0), reason }) }, async ({ ctx, body }) =>
    inTx(ctx, async (tx) => {
      const r = await adjustStock(tx, body);
      return r;
    }),
  ),
  api.post("inventory/write-off", { auth: "staff", body: z.object({ materialId: uuid, locationId: uuid, quantity: qty, reason }) }, async ({ ctx, body }) => writeOffStock(ctx, body)),

  api.post("procurement/requests", { auth: "staff", body: z.object({ materialId: uuid, quantity: qty, neededBy: dateLike.optional().nullable(), note: z.string().max(500).optional() }) }, async ({ ctx, body }) =>
    createMaterialRequest(ctx, body),
  ),
  api.post("procurement/requests/:id/cancel", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => cancelMaterialRequest(ctx, params.id!, body.reason)),
  api.post(
    "procurement/purchase-orders",
    {
      auth: "staff",
      body: z.object({
        supplierId: uuid,
        expectedAt: dateLike.optional().nullable(),
        note: z.string().max(1000).optional(),
        submit: z.boolean().optional(),
        lines: z.array(z.object({ materialId: uuid, quantity: qty, unitCost: z.number().min(0), locationId: uuid.optional().nullable(), materialRequestIds: z.array(uuid).max(50).optional() })).min(1).max(50),
      }),
    },
    async ({ ctx, body }) => createPurchaseOrder(ctx, body),
  ),
  api.post("procurement/purchase-orders/:id/submit", { auth: "staff" }, async ({ ctx, params }) => submitPurchaseOrder(ctx, params.id!)),
  api.post("procurement/purchase-orders/:id/cancel", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => cancelPurchaseOrder(ctx, params.id!, body.reason)),
  api.post(
    "procurement/purchase-orders/:id/receive",
    { auth: "staff", body: z.object({ lines: z.array(z.object({ lineId: uuid, quantity: z.number().min(0) })).min(1), note: z.string().max(500).optional(), idempotencyKey: idempotencyKey.optional() }) },
    async ({ ctx, params, body }) =>
      inTx(ctx, async (tx) => {
        const r = await receivePurchaseOrder(tx, params.id!, body);
        await syncRequirements(tx, r.affectedRequirementIds);
        return r;
      }),
  ),
  api.post(
    "procurement/suppliers",
    { auth: "staff", body: z.object({ id: uuid.optional(), name: z.string().min(2).max(200), contactName: z.string().max(120).nullable().optional(), phone: z.string().max(16).nullable().optional(), email: z.string().email().nullable().optional(), address: z.string().max(400).nullable().optional(), leadTimeDays: z.number().int().min(0).max(120), notes: z.string().max(1000).nullable().optional(), isActive: z.boolean().optional() }) },
    async ({ ctx, body }) => upsertSupplier(ctx, body),
  ),
];
