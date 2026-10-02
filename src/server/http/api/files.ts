import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/server/config/env";
import { assertCan, can } from "@/server/core/context";
import { AppError, forbidden } from "@/server/core/errors";
import { enforceRateLimit } from "@/server/auth/rate-limit";
import { storage } from "@/server/integrations/storage";
import { authorizeFileAccess, FILE_PURPOSES, storeUpload } from "@/server/modules/files/service";
import { api } from "../router";

const CUSTOMER_PURPOSES = new Set(["ARTWORK", "ATTACHMENT", "PAYMENT_RECEIPT"]);

export const fileRoutes = [
  /** Multipart upload: field `file`, field `purpose`. Returns the stored file id. */
  api.post("uploads", { auth: "any", raw: true }, async ({ ctx, req }) => {
    if (ctx.actor.kind === "anonymous") throw new AppError("UNAUTHENTICATED", "برای بارگذاری فایل وارد حساب کاربری شوید.");
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > env().UPLOAD_MAX_BYTES + 1024 * 1024) throw new AppError("PAYLOAD_TOO_LARGE", "حجم فایل بیش از حد مجاز است.");
    await enforceRateLimit(ctx.db, `upload:${ctx.actor.kind === "customer" ? ctx.actor.userId : ctx.ip}`, 60, 3600);
    const form = await req.formData().catch(() => {
      throw new AppError("VALIDATION", "فرم بارگذاری نامعتبر است.");
    });
    const file = form.get("file");
    const purpose = z.enum(FILE_PURPOSES).parse(form.get("purpose"));
    if (!(file instanceof File)) throw new AppError("VALIDATION", "فایلی انتخاب نشده است.");
    if (ctx.actor.kind === "customer" && !CUSTOMER_PURPOSES.has(purpose)) throw forbidden();
    if (ctx.actor.kind === "staff" && purpose === "PRODUCT_IMAGE") assertCan(ctx, "catalog.manage");
    if (ctx.actor.kind === "staff" && purpose === "DESIGN" && !can(ctx, "design.work")) throw forbidden();
    const stored = await storeUpload(ctx, { data: Buffer.from(await file.arrayBuffer()), filename: file.name, purpose });
    return { id: stored.id, name: stored.originalName, size: stored.sizeBytes, mimeType: stored.mimeType };
  }),

  /** Authorized download. Never served from a public directory. */
  api.get("files/:id", { auth: "any", query: z.object({ inline: z.enum(["1"]).optional() }) }, async ({ ctx, params, query }) => {
    const f = await authorizeFileAccess(ctx, params.id!);
    const stream = await storage().stream(f.storageKey);
    const inline = query.inline === "1" && (f.mimeType.startsWith("image/") || f.mimeType === "application/pdf");
    return new NextResponse(stream, {
      headers: {
        "Content-Type": f.mimeType,
        "Content-Length": String(f.sizeBytes),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.originalName)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
        "Cache-Control": "private, max-age=300",
      },
    });
  }),

];
