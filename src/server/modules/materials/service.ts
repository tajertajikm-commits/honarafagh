import { asc, desc, eq, sql } from "drizzle-orm";
import { machines, materials, orders, stockMovements, users } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, assertCanAny, inTx } from "@/server/core/context";
import { conflict, isUniqueViolation, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";

export const MATERIAL_CATEGORIES = {
  PAPER: "کاغذ",
  CARDBOARD: "مقوا",
  FILM: "فیلم سلفون",
  UV: "UV و ورنی",
  BINDING: "ملزومات صحافی",
  PLATE: "زینک",
  PACKAGING: "بسته‌بندی",
  OTHER: "سایر",
} as const;
export type MaterialCategory = keyof typeof MATERIAL_CATEGORIES;

/** Materials with stock; operators see them when choosing paper. */
export async function listMaterials(ctx: Ctx, f: { category?: MaterialCategory[]; activeOnly?: boolean } = {}) {
  assertCanAny(ctx, "inventory.manage", "digital.production", "dashboard.view");
  const rows = await ctx.db.select().from(materials).orderBy(asc(materials.category), asc(materials.name));
  return rows.filter((m) => (f.activeOnly === false || m.isActive) && (!f.category || f.category.includes(m.category as MaterialCategory)));
}

/** Receipts and corrections; consumption is recorded by production (paper step). */
export async function adjustStock(ctx: Ctx, materialId: string, input: { delta: number; reason: "RECEIVE" | "ADJUST"; note?: string | null }) {
  assertCan(ctx, "inventory.manage");
  if (!Number.isFinite(input.delta) || input.delta === 0) throw validation("مقدار نامعتبر است.");
  if (input.reason === "RECEIVE" && input.delta < 0) throw validation("مقدار دریافت باید مثبت باشد.");
  if (input.reason === "ADJUST" && !input.note?.trim()) throw validation("دلیل اصلاح موجودی را بنویسید.");
  return inTx(ctx, async (tx) => {
    const [m] = await tx.db.select().from(materials).where(eq(materials.id, materialId)).for("update");
    if (!m) throw notFound("ماده");
    await tx.db.update(materials).set({ stock: sql`${materials.stock} + ${input.delta}` }).where(eq(materials.id, materialId));
    await tx.db.insert(stockMovements).values({ materialId, delta: input.delta, reason: input.reason, note: input.note?.trim() || null, createdBy: actorUserId(tx) });
    await audit(tx, { action: `stock.${input.reason.toLowerCase()}`, entityType: "material", entityId: materialId, before: { stock: m.stock }, after: { stock: m.stock + input.delta }, reason: input.note ?? undefined });
  });
}

export interface MaterialInput {
  sku: string;
  name: string;
  category: MaterialCategory;
  unit: string;
  standardCost: number;
  minStock: number;
  grammage?: number | null;
  sheetWidthMm?: number | null;
  sheetHeightMm?: number | null;
  isActive?: boolean;
}

export async function saveMaterial(ctx: Ctx, id: string | null, input: MaterialInput) {
  assertCan(ctx, "inventory.manage");
  if (!(input.category in MATERIAL_CATEGORIES)) throw validation("دسته نامعتبر است.");
  const values = { ...input, sku: input.sku.trim().toUpperCase(), name: input.name.trim(), isActive: input.isActive ?? true };
  try {
    if (id) {
      const [row] = await ctx.db.update(materials).set(values).where(eq(materials.id, id)).returning();
      if (!row) throw notFound("ماده");
      return row;
    }
    const [row] = await ctx.db.insert(materials).values(values).returning();
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("این کد کالا قبلاً ثبت شده است.");
    throw err;
  }
}

export async function stockHistory(ctx: Ctx, materialId: string, limit = 30) {
  assertCan(ctx, "inventory.manage");
  return ctx.db
    .select({ movement: stockMovements, orderCode: orders.code, byName: users.fullName })
    .from(stockMovements)
    .leftJoin(orders, eq(orders.id, stockMovements.orderId))
    .leftJoin(users, eq(users.id, stockMovements.createdBy))
    .where(eq(stockMovements.materialId, materialId))
    .orderBy(desc(stockMovements.createdAt))
    .limit(limit);
}

/** Presses and digital printers (press assignment, queues). */
export async function listMachines(ctx: Ctx) {
  return ctx.db.select({ id: machines.id, name: machines.name, category: machines.category, code: machines.code }).from(machines).where(eq(machines.isActive, true)).orderBy(asc(machines.code));
}
