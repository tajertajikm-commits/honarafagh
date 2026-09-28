import { eq } from "drizzle-orm";
import type { Database } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { ALL_PERMISSIONS } from "@/server/auth/permissions";
import { hashPassword } from "@/server/auth/password";
import { systemCtx } from "@/server/core/context";
import { moveStock } from "@/server/modules/inventory/service";
import { productSpecSchema, pricingRulesSchema } from "@/server/modules/pricing/types";
import { validateTemplate } from "@/server/modules/workflow/graph";
import {
  CATEGORIES,
  DEFAULT_SETTINGS,
  DELIVERY_METHODS,
  DEMO_STAFF_PASSWORD,
  EMPLOYEES,
  LOCATIONS,
  MACHINE_TYPES,
  MACHINES,
  MATERIAL_CATEGORIES,
  MATERIALS,
  NOTIFICATION_TEMPLATES,
  PRICING_RULES,
  PRODUCTION_METHODS,
  PRODUCTS,
  QC_DEFECT_TYPES,
  ROLES,
  STEP_TYPES,
  SUPPLIERS,
  VEHICLES,
  WORKFLOW_TEMPLATES,
} from "./reference";

export interface ReferenceIds {
  employees: Map<string, { employeeId: string; userId: string }>;
  products: Map<string, string>;
  materials: Map<string, string>;
  locations: Map<string, string>;
  suppliers: Map<string, string>;
  deliveryMethods: Map<string, string>;
  machines: Map<string, string>;
  ruleSetId: string;
}

/** Seeds configuration & master data. Idempotency is not attempted: run on an empty database. */
export async function seedReference(db: Database, opts: { staffPassword?: string } = {}): Promise<ReferenceIds> {
  const ctx = { ...systemCtx("seed"), db };

  await db.insert(t.productionMethods).values(PRODUCTION_METHODS);
  await db.insert(t.machineTypes).values(MACHINE_TYPES);
  await db.insert(t.stepTypes).values(STEP_TYPES);
  await db.insert(t.materialCategories).values(MATERIAL_CATEGORIES);
  await db.insert(t.qcDefectTypes).values(QC_DEFECT_TYPES);
  await db.insert(t.appSettings).values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));

  const locations = new Map((await db.insert(t.warehouseLocations).values(LOCATIONS).returning()).map((l) => [l.code, l.id]));
  const suppliers = new Map<string, string>();
  for (const s of SUPPLIERS) {
    const [row] = await db.insert(t.suppliers).values({ name: s.name, contactName: s.contactName, phone: s.phone, leadTimeDays: s.leadTimeDays }).returning();
    suppliers.set(s.key, row!.id);
  }

  const materials = new Map<string, string>();
  for (const m of MATERIALS) {
    const [row] = await db
      .insert(t.materials)
      .values({
        sku: m.sku,
        name: m.name,
        categoryCode: m.category,
        unit: m.unit,
        standardCost: m.standardCost,
        reorderPoint: m.reorderPoint,
        reorderQuantity: m.reorderQuantity,
        defaultSupplierId: suppliers.get(m.supplier),
        defaultLocationId: locations.get(m.location),
        paperType: m.paper?.paperType,
        brand: m.paper?.brand,
        grammage: m.paper?.grammage,
        sheetWidthMm: m.paper?.w,
        sheetHeightMm: m.paper?.h,
        color: m.paper?.color,
      })
      .returning();
    materials.set(m.sku, row!.id);
    // Opening balance as a real RECEIVE transaction — stock is never written directly.
    await moveStock(ctx, { type: "RECEIVE", materialId: row!.id, locationId: locations.get(m.location)!, quantity: m.onHand, onHandDelta: m.onHand, reservedDelta: 0, unitCost: m.standardCost, reason: "موجودی اول دوره" });
  }

  const [ruleSet] = await db.insert(t.pricingRuleSets).values({ code: "DEFAULT", name: "قیمت‌گذاری عمومی", description: "نرخ‌های پایه چاپخانه" }).returning();
  await db.insert(t.pricingRuleVersions).values({ ruleSetId: ruleSet!.id, version: 1, status: "PUBLISHED", data: pricingRulesSchema.parse(PRICING_RULES), notes: "نسخه اولیه", publishedAt: new Date() });

  for (const w of WORKFLOW_TEMPLATES) {
    const issues = validateTemplate(w.steps);
    if (issues.length) throw new Error(`invalid template ${w.code}: ${JSON.stringify(issues)}`);
    const [tpl] = await db.insert(t.workflowTemplates).values({ code: w.code, version: 1, name: w.name, methodCode: w.methodCode, status: "ACTIVE", description: w.description }).returning();
    await db.insert(t.workflowTemplateSteps).values(
      w.steps.map((s, i) => ({
        templateId: tpl!.id,
        key: s.key,
        name: s.name,
        stepTypeCode: s.stepType,
        dependsOn: s.dependsOn,
        condition: s.condition,
        gate: s.gate,
        machineTypeCode: s.machineType,
        defaultMinutes: s.defaultMinutes,
        minLagMinutes: s.minLagMinutes,
        isQc: s.isQc,
        reworkTargets: s.reworkTargets,
        milestone: s.milestone,
        checklist: s.checklist,
        sortOrder: i,
      })),
    );
  }

  const categories = new Map((await db.insert(t.productCategories).values(CATEGORIES).returning()).map((c) => [c.slug, c.id]));
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
    const [row] = await db.insert(t.roles).values({ code: r.code, name: r.name, description: r.description, isSystem: true, workspaces: r.workspaces, stepTypes: r.stepTypes }).returning();
    roleIds.set(r.code, row!.id);
    const perms = r.permissions === "ALL" ? ALL_PERMISSIONS : r.permissions;
    await db.insert(t.rolePermissions).values(perms.map((permission) => ({ roleId: row!.id, permission })));
  }

  const passwordHash = await hashPassword(opts.staffPassword ?? DEMO_STAFF_PASSWORD);
  const employees = new Map<string, { employeeId: string; userId: string }>();
  for (const e of EMPLOYEES) {
    const [user] = await db.insert(t.users).values({ phone: e.phone, fullName: e.fullName, kind: "EMPLOYEE", passwordHash }).returning();
    const [emp] = await db.insert(t.employees).values({ userId: user!.id, personnelCode: e.code, title: e.title, hourlyCost: e.hourlyCost }).returning();
    await db.insert(t.employeeRoles).values(e.roles.map((code) => ({ employeeId: emp!.id, roleId: roleIds.get(code)! })));
    employees.set(e.code, { employeeId: emp!.id, userId: user!.id });
  }

  const machines = new Map<string, string>();
  for (const m of MACHINES) {
    const [row] = await db
      .insert(t.machines)
      .values({
        code: m.code,
        name: m.name,
        typeCode: m.typeCode,
        methodCode: m.methodCode,
        capacityPerHour: m.capacityPerHour,
        setupMinutes: m.setupMinutes,
        hourlyCost: m.hourlyCost,
        colors: "colors" in m ? m.colors : null,
        maxSheetWidthMm: "maxW" in m ? m.maxW : null,
        maxSheetHeightMm: "maxH" in m ? m.maxH : null,
        defaultOperatorId: m.operator ? employees.get(m.operator)!.employeeId : null,
        location: m.typeCode === "DIGITAL_PRESS" || m.typeCode === "PLOTTER" ? "سالن دیجیتال" : "سالن تولید",
      })
      .returning();
    machines.set(m.code, row!.id);
  }

  const deliveryMethods = new Map((await db.insert(t.deliveryMethods).values(DELIVERY_METHODS.map((d, i) => ({ ...d, sortOrder: i }))).returning()).map((d) => [d.code, d.id]));
  await db.insert(t.vehicles).values(VEHICLES);
  await db.insert(t.notificationTemplates).values(NOTIFICATION_TEMPLATES.map((n) => ({ ...n, roleCode: "roleCode" in n ? n.roleCode : null })));

  return { employees, products, materials, locations, suppliers, deliveryMethods, machines, ruleSetId: ruleSet!.id };
}

export async function employeeUserId(db: Database, code: string) {
  const [e] = await db.select({ userId: t.employees.userId }).from(t.employees).where(eq(t.employees.personnelCode, code));
  return e?.userId ?? null;
}
