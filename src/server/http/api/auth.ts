import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtp, verifyOtp } from "@/server/auth/otp";
import { authenticateStaff } from "@/server/auth/staff-login";
import { createSession, loadCustomerActor, revokeSession } from "@/server/auth/sessions";
import { createCtx } from "@/server/core/context";
import { mergeGuestCart } from "@/server/modules/orders/cart";
import { CART_COOKIE, CUSTOMER_COOKIE, cookieOptions, STAFF_COOKIE } from "../cookies";
import { api } from "../router";
import { phone } from "./schemas";

export const authRoutes = [
  api.post("auth/otp/request", { auth: "public", body: z.object({ phone }) }, async ({ ctx, body }) => requestOtp(ctx.db, body.phone, ctx.ip)),

  api.post("auth/otp/verify", { auth: "public", body: z.object({ phone, code: z.string().min(4).max(8) }) }, async ({ ctx, body, req }) => {
    const { userId, isNew } = await verifyOtp(ctx.db, body.phone, body.code, ctx.ip);
    const session = await createSession(ctx.db, userId, "CUSTOMER", { ip: ctx.ip, userAgent: ctx.userAgent });
    const actor = await loadCustomerActor(ctx.db, userId);
    const res = NextResponse.json({ data: { isNew, name: actor?.name ?? "" } });
    res.cookies.set(CUSTOMER_COOKIE, session.token, cookieOptions(session.expiresAt));
    const guest = req.cookies.get(CART_COOKIE)?.value;
    if (guest && actor) {
      await mergeGuestCart(createCtx(actor), guest);
      res.cookies.delete(CART_COOKIE);
    }
    return res;
  }),

  api.post("auth/logout", { auth: "public" }, async ({ ctx, req }) => {
    const token = req.cookies.get(CUSTOMER_COOKIE)?.value;
    if (token) await revokeSession(ctx.db, token);
    const res = NextResponse.json({ data: null });
    res.cookies.delete(CUSTOMER_COOKIE);
    return res;
  }),

  api.post("staff/auth/login", { auth: "public", body: z.object({ phone, password: z.string().min(1).max(200) }) }, async ({ ctx, body }) => {
    const { userId } = await authenticateStaff(ctx.db, body.phone, body.password, ctx.ip);
    const session = await createSession(ctx.db, userId, "STAFF", { ip: ctx.ip, userAgent: ctx.userAgent });
    const res = NextResponse.json({ data: { ok: true } });
    res.cookies.set(STAFF_COOKIE, session.token, cookieOptions(session.expiresAt));
    return res;
  }),

  api.post("staff/auth/logout", { auth: "public" }, async ({ ctx, req }) => {
    const token = req.cookies.get(STAFF_COOKIE)?.value;
    if (token) await revokeSession(ctx.db, token);
    const res = NextResponse.json({ data: null });
    res.cookies.delete(STAFF_COOKIE);
    return res;
  }),
];
