import { z } from "zod";
import { assertCan } from "@/server/core/context";
import { saveProduct, setProductActive, upsertCategory } from "@/server/modules/catalog/admin";
import { adjustStock, saveMaterial } from "@/server/modules/materials/service";
import { saveSupplier } from "@/server/modules/offset/service";
import { createCustomer, createEmployee, listCustomers, resetEmployeePassword, setEmployeeRoles, updateCustomer, updateEmployee, upsertRole } from "@/server/modules/people/service";
import { createDraft, discardDraft, getRuleVersion, listRuleSets, priceProduct, publishDraft, updateDraft } from "@/server/modules/pricing/service";
import { settingsSchemas, updateSetting } from "@/server/modules/settings/service";
import { api } from "../router";
import { phone, selections, urgency, uuid } from "./schemas";

const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const customerFields = {
  fullName: z.string().trim().min(2).max(120).optional(),
  type: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
  companyName: opt(160),
  nationalId: opt(11),
  economicCode: opt(16),
  registrationNo: opt(20),
  email: z.string().email().nullable().optional(),
  billingAddress: opt(400),
  postalCode: z.string().regex(/^\d{10}$/).nullable().optional(),
  notes: opt(1000),
};

export const adminRoutes = [
  // ── Employees & roles ───────────────────────────────────────────────────
  api.post(
    "employees",
    { auth: "staff", body: z.object({ phone, fullName: z.string().min(2).max(120), personnelCode: z.string().min(1).max(16), title: opt(120), roleIds: z.array(uuid).max(20), password: z.string().min(8).max(200) }) },
    async ({ ctx, body }) => createEmployee(ctx, body),
  ),
  api.patch("employees/:id", { auth: "staff", body: z.object({ fullName: z.string().min(2).max(120).optional(), title: opt(120), isActive: z.boolean().optional() }) }, async ({ ctx, params, body }) => updateEmployee(ctx, params.id!, body)),
  api.put("employees/:id/roles", { auth: "staff", body: z.object({ roleIds: z.array(uuid).max(20) }) }, async ({ ctx, params, body }) => setEmployeeRoles(ctx, params.id!, body.roleIds)),
  api.post("employees/:id/password", { auth: "staff", body: z.object({ password: z.string().min(8).max(200) }) }, async ({ ctx, params, body }) => resetEmployeePassword(ctx, params.id!, body.password)),
  api.post(
    "roles",
    { auth: "staff", body: z.object({ id: uuid.optional(), code: z.string().max(48), name: z.string().min(2).max(80), description: opt(300), permissions: z.array(z.string().max(64)).max(100) }) },
    async ({ ctx, body }) => upsertRole(ctx, body),
  ),

  // ── Customers ───────────────────────────────────────────────────────────
  api.post("customers", { auth: "staff", body: z.object({ ...customerFields, phone, fullName: z.string().trim().min(2).max(120) }) }, async ({ ctx, body }) => createCustomer(ctx, body)),
  api.patch("customers/:id", { auth: "any", body: z.object({ ...customerFields, discountPct: z.number().min(0).max(100).optional() }) }, async ({ ctx, params, body }) => updateCustomer(ctx, params.id!, body)),
  api.get("customers", { auth: "staff", query: z.object({ q: z.string().max(80).optional(), page: z.coerce.number().int().min(1).optional() }) }, async ({ ctx, query }) => {
    const r = await listCustomers(ctx, { q: query.q, page: query.page, pageSize: 20 });
    return { total: r.total, rows: r.rows.map((x) => ({ id: x.c.id, code: x.c.code, fullName: x.c.fullName, companyName: x.c.companyName, phone: x.c.phone, orderCount: x.orderCount, balance: x.balance })) };
  }),

  // ── Materials & suppliers ───────────────────────────────────────────────
  api.post(
    "materials",
    {
      auth: "staff",
      body: z.object({
        id: uuid.optional(),
        sku: z.string().min(2).max(48),
        name: z.string().min(2).max(160),
        category: z.enum(["PAPER", "CARDBOARD", "FILM", "UV", "BINDING", "PLATE", "PACKAGING", "OTHER"]),
        unit: z.string().min(1).max(12),
        standardCost: z.number().min(0).max(1e12),
        minStock: z.number().min(0).max(1e9),
        grammage: z.number().int().min(0).max(2000).nullable().optional(),
        sheetWidthMm: z.number().int().min(0).max(5000).nullable().optional(),
        sheetHeightMm: z.number().int().min(0).max(5000).nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    },
    async ({ ctx, body }) => {
      const { id, ...rest } = body;
      return saveMaterial(ctx, id ?? null, rest);
    },
  ),
  api.post("materials/:id/stock", { auth: "staff", body: z.object({ delta: z.number().min(-1e9).max(1e9), reason: z.enum(["RECEIVE", "ADJUST"]), note: opt(300) }) }, async ({ ctx, params, body }) => adjustStock(ctx, params.id!, body)),
  api.post(
    "suppliers",
    { auth: "staff", body: z.object({ id: uuid.optional(), name: z.string().min(2).max(120), kind: z.enum(["PAPER", "LITHO", "OTHER"]), contactName: opt(120), phone: opt(16), notes: opt(500), isActive: z.boolean().optional() }) },
    async ({ ctx, body }) => saveSupplier(ctx, body),
  ),

  // ── Store catalog & pricing (versioned) ─────────────────────────────────
  api.post("catalog/products", { auth: "staff", body: z.unknown() }, async ({ ctx, body }) => ({ id: await saveProduct(ctx, null, body) })),
  api.put("catalog/products/:id", { auth: "staff", body: z.unknown() }, async ({ ctx, params, body }) => ({ id: await saveProduct(ctx, params.id!, body) })),
  api.post("catalog/products/:id/active", { auth: "staff", body: z.object({ isActive: z.boolean() }) }, async ({ ctx, params, body }) => setProductActive(ctx, params.id!, body.isActive)),
  api.post(
    "catalog/categories",
    { auth: "staff", body: z.object({ id: uuid.optional(), slug: z.string().max(80), name: z.string().min(2).max(80), description: opt(300), icon: opt(32), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() }) },
    async ({ ctx, body }) => upsertCategory(ctx, body),
  ),
  api.get("pricing/rule-sets", { auth: "staff" }, async ({ ctx }) => listRuleSets(ctx)),
  api.get("pricing/versions/:id", { auth: "staff" }, async ({ ctx, params }) => getRuleVersion(ctx, params.id!)),
  api.post("pricing/versions/:id/draft", { auth: "staff", body: z.object({ notes: z.string().max(500).optional() }) }, async ({ ctx, params, body }) => createDraft(ctx, params.id!, body.notes)),
  api.put("pricing/versions/:id", { auth: "staff", body: z.object({ data: z.unknown(), notes: z.string().max(500).optional() }) }, async ({ ctx, params, body }) => updateDraft(ctx, params.id!, body.data, body.notes)),
  api.post("pricing/versions/:id/publish", { auth: "staff" }, async ({ ctx, params }) => publishDraft(ctx, params.id!)),
  api.post("pricing/versions/:id/discard", { auth: "staff" }, async ({ ctx, params }) => discardDraft(ctx, params.id!)),
  api.post(
    "pricing/simulate",
    { auth: "staff", body: z.object({ versionId: uuid, productId: uuid, quantity: z.number().int().positive(), selections, urgency, forceMethod: z.enum(["DIGITAL", "OFFSET"]).optional() }) },
    async ({ ctx, body }) => {
      assertCan(ctx, "catalog.manage");
      return priceProduct(ctx.db, { productId: body.productId, quantity: body.quantity, selections: body.selections, urgency: body.urgency, ruleVersionId: body.versionId, forceMethod: body.forceMethod });
    },
  ),

  // ── Settings ────────────────────────────────────────────────────────────
  api.put("settings/:key", { auth: "staff", body: z.unknown() }, async ({ ctx, params, body }) => updateSetting(ctx, z.enum(Object.keys(settingsSchemas) as ["business", "invoice"]).parse(params.key), body)),
];
