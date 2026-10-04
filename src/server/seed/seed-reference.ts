import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { productSpecSchema, pricingRulesSchema } from "@/server/modules/pricing/types";
import { CATEGORIES, DEFAULT_SETTINGS, DELIVERY_METHODS, DEMO_STAFF_PASSWORD, EMPLOYEES, MACHINES, MATERIALS, NOTIFICATION_TEMPLATES, PRICING_RULES, PRODUCTS, ROLES, SUPPLIERS } from "./reference";

export interface ReferenceIds {
  /** Keyed by personnel code (E001…) and by short key (hamed, labafi…). */
  employees: Map<string, { employeeId: string; userId: string }>;
  products: Map<string, string>;
  materials: Map<string, string>;
  suppliers: Map<string, string>;
  deliveryMethods: Map<string, string>;
  machines: Map<string, string>;
  ruleSetId: string;
}

/**
 * Seeds configuration & master data. Run on an empty database.
 * The material list (paper and cardboard types with their costs) is always seeded:
 * store pricing uses it. `samples` adds made-up suppliers and stock quantities
 * (tests and walkthroughs); a real installation starts at zero stock and no
 * suppliers, and enters its own.
 */
export async function seedReference(db: Database, opts: { staffPassword?: string; samples?: boolean } = {}): Promise<ReferenceIds> {
  await db.insert(t.appSettings).values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));

  const suppliers = new Map<string, string>();
  for (const s of opts.samples ? SUPPLIERS : []) {
    const [row] = await db.insert(t.suppliers).values({ name: s.name, kind: s.kind, contactName: s.contactName, phone: s.phone }).returning();
    suppliers.set(s.key, row!.id);
  }

  const materials = new Map<string, string>();
  for (const m of MATERIALS) {
    const stock = opts.samples ? m.onHand : 0;
    const [row] = await db
      .insert(t.materials)
      .values({ sku: m.sku, name: m.name, category: m.category, unit: m.unit, standardCost: m.standardCost, grammage: m.paper?.grammage, sheetWidthMm: m.paper?.w, sheetHeightMm: m.paper?.h, stock, minStock: opts.samples ? m.reorderPoint : 0 })
      .returning();
    materials.set(m.sku, row!.id);
    if (stock > 0) await db.insert(t.stockMovements).values({ materialId: row!.id, delta: stock, reason: "RECEIVE", note: "موجودی اول دوره" });
  }

  const [ruleSet] = await db.insert(t.pricingRuleSets).values({ code: "DEFAULT", name: "قیمت‌گذاری عمومی", description: "نرخ‌های پایه چاپخانه" }).returning();
  await db.insert(t.pricingRuleVersions).values({ ruleSetId: ruleSet!.id, version: 1, status: "PUBLISHED", data: pricingRulesSchema.parse(PRICING_RULES), notes: "نسخه اولیه", publishedAt: new Date() });

  const categories = new Map((await db.insert(t.productCategories).values(CATEGORIES).returning()).map((c) => [c.slug, c.id] as const));
  const products = new Map<string, string>();
  for (const [pi, p] of PRODUCTS.entries()) {
    const [row] = await db
      .insert(t.products)
      .values({
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        description: p.description,
        categoryId: categories.get(p.category),
        pricingRuleSetId: ruleSet!.id,
        spec: productSpecSchema.parse(p.spec),
        unitLabel: p.unitLabel,
        minQuantity: p.minQuantity,
        maxQuantity: p.maxQuantity,
        quantityStep: p.quantityStep,
        quantityPresets: p.quantityPresets,
        isFeatured: p.isFeatured,
        highlights: p.highlights,
        sortOrder: pi,
      })
      .returning();
    products.set(p.slug, row!.id);
    await db.insert(t.productImages).values({ productId: row!.id, url: p.image, alt: p.name });
    await db.insert(t.productMethods).values(p.methods.map((m, i) => ({ productId: row!.id, ...m, sortOrder: i })));
    for (const [gi, g] of p.groups.entries()) {
      const [group] = await db
        .insert(t.productOptionGroups)
        .values({ productId: row!.id, key: g.key, label: g.label, helpText: g.helpText ?? null, type: g.type, required: g.required, config: (g.config as never) ?? null, sortOrder: gi })
        .returning();
      if (g.values.length) {
        await db.insert(t.productOptionValues).values(g.values.map((v, vi) => ({ groupId: group!.id, key: v.key, label: v.label, description: v.description ?? null, effects: v.effects, isDefault: !!v.isDefault, sortOrder: vi })));
      }
    }
  }

  const roleIds = new Map<string, string>();
  for (const r of ROLES) {
    const [row] = await db.insert(t.roles).values({ code: r.code, name: r.name, description: r.description, isSystem: true }).returning();
    roleIds.set(r.code, row!.id);
    await db.insert(t.rolePermissions).values(r.permissions.map((permission) => ({ roleId: row!.id, permission })));
  }

  const passwordHash = await hashPassword(opts.staffPassword ?? DEMO_STAFF_PASSWORD);
  const employees = new Map<string, { employeeId: string; userId: string }>();
  for (const e of EMPLOYEES) {
    const [user] = await db.insert(t.users).values({ phone: e.phone, fullName: e.fullName, kind: "EMPLOYEE", passwordHash }).returning();
    const [emp] = await db.insert(t.employees).values({ userId: user!.id, personnelCode: e.code, title: e.title }).returning();
    await db.insert(t.employeeRoles).values(e.roles.map((code) => ({ employeeId: emp!.id, roleId: roleIds.get(code)! })));
    const ids = { employeeId: emp!.id, userId: user!.id };
    employees.set(e.code, ids);
    employees.set(e.key, ids);
  }

  const machines = new Map<string, string>();
  for (const m of MACHINES) {
    const [row] = await db.insert(t.machines).values(m).returning();
    machines.set(m.code, row!.id);
  }

  const deliveryMethods = new Map((await db.insert(t.deliveryMethods).values(DELIVERY_METHODS.map((d, i) => ({ ...d, sortOrder: i }))).returning()).map((d) => [d.code, d.id] as const));
  await db.insert(t.notificationTemplates).values(NOTIFICATION_TEMPLATES.map((n) => ({ ...n, permission: n.permission ?? null })));

  return { employees, products, materials, suppliers, deliveryMethods, machines, ruleSetId: ruleSet!.id };
}

export async function employeeUserId(db: Database, code: string) {
  const [e] = await db.select({ userId: t.employees.userId }).from(t.employees).where(eq(t.employees.personnelCode, code));
  return e?.userId ?? null;
}
