import { z } from "zod";

export const uuid = z.string().uuid();
export const selections = z.record(z.string().max(40), z.union([z.string().max(60), z.number(), z.boolean()])).refine((o) => Object.keys(o).length <= 30, "too many options");
export const urgency = z.enum(["STANDARD", "EXPRESS", "RUSH"]);
export const rial = z.number().int().min(0).max(1e13);
export const positiveRial = z.number().int().positive().max(1e13);
export const idempotencyKey = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const reason = z.string().trim().min(2).max(1000);
export const note = z.string().trim().max(2000).optional().nullable();
export const phone = z.string().min(10).max(16);
export const qty = z.number().finite().positive().max(1e9);
export const dateLike = z.coerce.date();

export const address = z.object({
  title: z.string().max(60).optional(),
  province: z.string().trim().min(2).max(60),
  city: z.string().trim().min(2).max(60),
  line: z.string().trim().min(5).max(400),
  postalCode: z.string().regex(/^\d{10}$/).optional().nullable(),
  recipientName: z.string().trim().min(2).max(120),
  recipientPhone: phone,
});

export const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
