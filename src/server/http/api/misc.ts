import { z } from "zod";
import { forbidden } from "@/server/core/errors";
import { inboxFor, markRead } from "@/server/modules/notifications/service";
import { deleteAddress, saveAddress } from "@/server/modules/people/service";
import { globalSearch } from "@/server/modules/search/service";
import { api } from "../router";
import { phone, uuid } from "./schemas";

export const miscRoutes = [
  api.get("search", { auth: "staff", query: z.object({ q: z.string().max(80) }) }, async ({ ctx, query }) => globalSearch(ctx, query.q)),
  api.get("notifications", { auth: "any" }, async ({ ctx }) => {
    if (ctx.actor.kind !== "staff" && ctx.actor.kind !== "customer") throw forbidden();
    return inboxFor(ctx, ctx.actor.userId);
  }),
  api.post("notifications/read", { auth: "any", body: z.object({ ids: z.array(uuid).max(100).optional() }) }, async ({ ctx, body }) => {
    if (ctx.actor.kind !== "staff" && ctx.actor.kind !== "customer") throw forbidden();
    await markRead(ctx, ctx.actor.userId, body.ids);
  }),
  api.post(
    "account/addresses",
    { auth: "customer", body: z.object({ id: uuid.optional(), title: z.string().min(1).max(60), province: z.string().min(2).max(60), city: z.string().min(2).max(60), line: z.string().min(5).max(400), postalCode: z.string().max(10).nullable().optional(), recipientName: z.string().min(2).max(120), recipientPhone: phone, isDefault: z.boolean().optional() }) },
    async ({ ctx, body }) => saveAddress(ctx, body),
  ),
  api.delete("account/addresses/:id", { auth: "customer" }, async ({ ctx, params }) => deleteAddress(ctx, params.id!)),
];
