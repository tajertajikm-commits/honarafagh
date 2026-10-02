import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { artworkFiles, fileObjects, orders, payments } from "@/server/db/schema";
import { env } from "@/server/config/env";
import { type Ctx, actorUserId, can } from "@/server/core/context";
import { AppError, forbidden, notFound, validation } from "@/server/core/errors";
import { storage } from "@/server/integrations/storage";
import { canAccessOrder } from "@/server/modules/orders/state";

export const FILE_PURPOSES = ["ARTWORK", "DESIGN", "PAYMENT_RECEIPT", "PRODUCT_IMAGE", "ATTACHMENT"] as const;
export type Purpose = (typeof FILE_PURPOSES)[number];

// ── Upload validation ───────────────────────────────────────────────────────

interface Sniffed {
  mime: string;
  ext: string;
}

/** Detects the real type from magic bytes — the client-supplied type is ignored. */
export function sniff(buf: Buffer): Sniffed | null {
  const s = (o: number, sig: number[]) => sig.every((b, i) => buf[o + i] === b);
  if (s(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf" }; // %PDF- (also AI files)
  if (s(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (s(0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (s(0, [0x49, 0x49, 0x2a, 0x00]) || s(0, [0x4d, 0x4d, 0x00, 0x2a])) return { mime: "image/tiff", ext: "tif" };
  if (s(0, [0x38, 0x42, 0x50, 0x53])) return { mime: "image/vnd.adobe.photoshop", ext: "psd" };
  if (s(0, [0x52, 0x49, 0x46, 0x46]) && s(8, [0x57, 0x45, 0x42, 0x50])) return { mime: "image/webp", ext: "webp" };
  if (s(0, [0x25, 0x21, 0x50, 0x53]) || s(0, [0xc5, 0xd0, 0xd3, 0xc6])) return { mime: "application/postscript", ext: "eps" };
  if (s(0, [0x50, 0x4b, 0x03, 0x04])) return { mime: "application/zip", ext: "zip" };
  return null;
}

const PRINT_FILES = ["application/pdf", "image/png", "image/jpeg", "image/tiff", "image/vnd.adobe.photoshop", "application/postscript", "application/zip"];
const ALLOWED: Record<Purpose, string[]> = {
  ARTWORK: PRINT_FILES,
  DESIGN: PRINT_FILES,
  ATTACHMENT: ["application/pdf", "image/png", "image/jpeg", "image/webp", "application/zip"],
  PRODUCT_IMAGE: ["image/png", "image/jpeg", "image/webp"],
  PAYMENT_RECEIPT: ["image/png", "image/jpeg", "application/pdf"],
};

const IMAGE_LIMIT = 15 * 1024 * 1024;

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").slice(0, 180) || "file";
}

export async function storeUpload(ctx: Ctx, input: { data: Buffer; filename: string; purpose: Purpose }) {
  const max = input.purpose === "ARTWORK" || input.purpose === "DESIGN" || input.purpose === "ATTACHMENT" ? env().UPLOAD_MAX_BYTES : Math.min(env().UPLOAD_MAX_BYTES, IMAGE_LIMIT);
  if (input.data.length === 0) throw validation("فایل خالی است.");
  if (input.data.length > max) throw new AppError("PAYLOAD_TOO_LARGE", `حداکثر حجم مجاز ${Math.round(max / 1024 / 1024)} مگابایت است.`);
  const type = sniff(input.data);
  if (!type || !ALLOWED[input.purpose].includes(type.mime)) {
    throw new AppError("UNSUPPORTED_MEDIA", "نوع فایل مجاز نیست. فرمت‌های مجاز: PDF، TIFF، JPG، PNG، PSD، EPS.");
  }
  const now = new Date();
  const key = `${input.purpose.toLowerCase()}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${type.ext}`;
  const sha256 = createHash("sha256").update(input.data).digest("hex");
  await storage().put(key, input.data, type.mime);
  const [row] = await ctx.db
    .insert(fileObjects)
    .values({
      storageDriver: storage().name,
      storageKey: key,
      originalName: sanitizeFilename(input.filename),
      mimeType: type.mime,
      sizeBytes: input.data.length,
      sha256,
      purpose: input.purpose,
      uploadedBy: actorUserId(ctx),
    })
    .returning();
  return row!;
}

// ── Download authorisation (IDOR protection) ────────────────────────────────

/**
 * A file may be read by its uploader, or by anyone who may open the order
 * it belongs to (artwork, payment receipts). Product images are public.
 */
export async function authorizeFileAccess(ctx: Ctx, fileId: string) {
  const [file] = await ctx.db.select().from(fileObjects).where(eq(fileObjects.id, fileId));
  if (!file) throw notFound("فایل");
  if (file.purpose === "PRODUCT_IMAGE") return file;
  const me = actorUserId(ctx);
  if (me && file.uploadedBy === me) return file;
  if (ctx.actor.kind === "staff" || ctx.actor.kind === "customer") {
    const [art] = await ctx.db
      .select({ order: orders, artwork: artworkFiles })
      .from(artworkFiles)
      .innerJoin(orders, eq(orders.id, artworkFiles.orderId))
      .where(eq(artworkFiles.fileId, fileId))
      .limit(1);
    if (art && canAccessOrder(ctx, art.order)) {
      // Designer drafts stay internal until approved.
      if (ctx.actor.kind === "customer" && art.artwork.source === "DESIGNER" && art.artwork.status !== "APPROVED") throw forbidden("دسترسی به این فایل مجاز نیست.");
      return file;
    }
    const [rcpt] = await ctx.db.select({ order: orders }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(and(eq(payments.receiptFileId, fileId))).limit(1);
    if (rcpt && (ctx.actor.kind === "customer" ? rcpt.order.customerId === ctx.actor.customerId : can(ctx, "payment.view"))) return file;
  }
  throw forbidden("دسترسی به این فایل مجاز نیست.");
}
