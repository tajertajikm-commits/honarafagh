import { NextResponse } from "next/server";
import { z } from "zod";
import { appUrl } from "@/server/config/env";
import { approvePayment, handlePaymentCallback, recordManualPayment, refundPayment, rejectPayment, startOnlinePayment } from "@/server/modules/finance/service";
import { issueInvoice, voidInvoice } from "@/server/modules/finance/invoices";
import { api } from "../router";
import { dateLike, idempotencyKey, note, positiveRial, reason, uuid } from "./schemas";

export const paymentRoutes = [
  api.post("orders/:id/pay", { auth: "any", body: z.object({ amount: positiveRial.optional(), idempotencyKey }) }, async ({ ctx, params, body }) => startOnlinePayment(ctx, params.id!, body)),

  /** Gateway return URL: verifies, then redirects the browser to the result page. */
  api.get("payments/callback/:provider", { auth: "public" }, async ({ params, req }) => {
    const pid = req.nextUrl.searchParams.get("pid");
    let status = "failed";
    let orderId = "";
    try {
      const p = await handlePaymentCallback(params.provider!, req.nextUrl.searchParams);
      status = p.status === "CONFIRMED" ? "success" : p.status === "CANCELLED" ? "cancelled" : "failed";
      orderId = p.orderId;
    } catch (err) {
      console.error("[payment] callback failed", err);
    }
    const url = appUrl("/payment/result");
    url.searchParams.set("status", status);
    if (orderId) url.searchParams.set("order", orderId);
    if (pid) url.searchParams.set("pid", pid);
    return NextResponse.redirect(url, 303);
  }),

  api.post(
    "orders/:id/payments",
    {
      auth: "any",
      body: z.object({
        method: z.enum(["CASH", "POS", "BANK_TRANSFER", "CHEQUE", "CREDIT"]),
        amount: positiveRial,
        reference: z.string().max(120).optional().nullable(),
        chequeDueDate: dateLike.optional().nullable(),
        note,
        receiptFileId: uuid.optional().nullable(),
        idempotencyKey,
      }),
    },
    async ({ ctx, params, body }) => recordManualPayment(ctx, params.id!, body),
  ),
  api.post("payments/:id/approve", { auth: "staff" }, async ({ ctx, params }) => approvePayment(ctx, params.id!)),
  api.post("payments/:id/reject", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => rejectPayment(ctx, params.id!, body.reason)),
  api.post(
    "orders/:id/refunds",
    { auth: "staff", body: z.object({ amount: positiveRial, method: z.enum(["CASH", "POS", "BANK_TRANSFER", "CHEQUE"]), reference: z.string().max(120).optional().nullable(), reason, idempotencyKey }) },
    async ({ ctx, params, body }) => refundPayment(ctx, params.id!, body),
  ),
  api.post("orders/:id/invoices", { auth: "staff", body: z.object({ type: z.enum(["OFFICIAL", "UNOFFICIAL"]).optional(), notes: z.string().max(1000).nullable().optional() }) }, async ({ ctx, params, body }) => {
    const inv = await issueInvoice(ctx, params.id!, body);
    return { id: inv.id, number: inv.number };
  }),
  api.post("invoices/:id/void", { auth: "staff", body: z.object({ reason }) }, async ({ ctx, params, body }) => voidInvoice(ctx, params.id!, body.reason)),
];
