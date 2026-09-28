import { z } from "zod";
import { acceptQuote, createInquiry, createQuote, rejectQuote, sendQuote, setInquiryStatus } from "@/server/modules/quotes/service";
import { api } from "../router";
import { dateLike, rial, selections, urgency, uuid } from "./schemas";

export const quoteRoutes = [
  api.post(
    "inquiries",
    {
      auth: "any",
      body: z.object({
        customerId: uuid.optional(),
        productId: uuid.nullable().optional(),
        title: z.string().trim().min(3).max(200),
        description: z.string().trim().min(10).max(4000),
        quantity: z.number().int().positive().max(10_000_000).nullable().optional(),
        selections: selections.nullable().optional(),
        deadline: dateLike.nullable().optional(),
        attachmentFileIds: z.array(uuid).max(10).optional(),
      }),
    },
    async ({ ctx, body }) => createInquiry(ctx, body),
  ),
  api.post("inquiries/:id/status", { auth: "staff", body: z.object({ status: z.enum(["IN_REVIEW", "CLOSED", "REJECTED"]), reason: z.string().max(1000).optional() }) }, async ({ ctx, params, body }) =>
    setInquiryStatus(ctx, params.id!, body.status, body.reason),
  ),
  api.post(
    "quotes",
    {
      auth: "staff",
      body: z.object({
        customerId: uuid,
        inquiryId: uuid.nullable().optional(),
        urgency: urgency.optional(),
        validDays: z.number().int().min(1).max(90).optional(),
        items: z.array(z.object({ productId: uuid.nullable().optional(), quantity: z.number().int().positive(), selections: selections.optional(), title: z.string().max(200).optional(), description: z.string().max(1000).optional(), lineSubtotal: rial.optional(), costTotal: rial.optional() })).min(1).max(30),
        discountAmount: rial.optional(),
        customerNote: z.string().max(2000).nullable().optional(),
        internalNote: z.string().max(2000).nullable().optional(),
      }),
    },
    async ({ ctx, body }) => createQuote(ctx, body),
  ),
  api.post("quotes/:id/send", { auth: "staff" }, async ({ ctx, params }) => sendQuote(ctx, params.id!)),
  api.post("quotes/:id/accept", { auth: "any" }, async ({ ctx, params }) => acceptQuote(ctx, params.id!)),
  api.post("quotes/:id/reject", { auth: "any", body: z.object({ reason: z.string().max(1000).optional() }) }, async ({ ctx, params, body }) => rejectQuote(ctx, params.id!, body.reason)),
];
