import { z } from "zod";
import { saveProduct, setProductActive, upsertCategory } from "@/server/modules/catalog/admin";
import { scheduleMaintenance, setMachineStatus, updateMaintenance, upsertMachine } from "@/server/modules/machines/service";
import { createCustomer, createEmployee, resetEmployeePassword, setEmployeeRoles, updateCustomer, updateEmployee, upsertRole } from "@/server/modules/people/service";
import { createDraft, discardDraft, getRuleVersion, listRuleSets, priceProduct, publishDraft, updateDraft } from "@/server/modules/pricing/service";
import { settingsSchemas, updateSetting } from "@/server/modules/settings/service";
import { activateTemplate, createTemplateDraft, getTemplate, listTemplates, saveTemplateDraft } from "@/server/modules/workflow/admin";
import { assertCan } from "@/server/core/context";
import { api } from "../router";
import { dateLike, phone, reason, selections, urgency, uuid } from "./schemas";

export const adminRoutes = [
  // Machines
  api.post(
    "machines",
    {
      auth: "staff",
      body: z.object({
        id: uuid.optional(),
        code: z.string().min(2).max(24),
        name: z.string().min(2).max(120),
        typeCode: z.string().max(32),
        methodCode: z.string().max(24).nullable().optional(),
        capacityPerHour: z.number().int().positive().optional(),
        setupMinutes: z.number().int().min(0).optional(),
        colors: z.number().int().min(1).max(12).nullable().optional(),
        hourlyCost: z.number().int().min(0).optional(),
        location: z.string().max(120).nullable().optional(),
        defaultOperatorId: uuid.nullable().optional(),
        notes: z.string().max(1000).nullable().optional(),
        isActive: z.boolean().optional(),
      }),
    },
    async ({ ctx, body }) => upsertMachine(ctx, body),
  ),
  api.post("machines/:id/status", { auth: "staff", body: z.object({ status: z.enum(["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE"]), reason }) }, async ({ ctx, params, body }) => setMachineStatus(ctx, params.id!, body.status, body.reason)),
  api.post(
    "machines/:id/maintenance",
    { auth: "staff", body: z.object({ kind: z.enum(["PREVENTIVE", "REPAIR", "INSPECTION"]), title: z.string().min(2).max(200), notes: z.string().max(1000).optional(), scheduledStart: dateLike, scheduledEnd: dateLike }) },
    async ({ ctx, params, body }) => scheduleMaintenance(ctx, { ...body, machineId: params.id! }),
  ),
  api.post("maintenance/:id/:action", { auth: "staff", body: z.object({ cost: z.number().int().min(0).optional(), notes: z.string().max(1000).optional() }) }, async ({ ctx, params, body }) =>
    updateMaintenance(ctx, params.id!, z.enum(["START", "COMPLETE", "CANCEL"]).parse(params.action!.toUpperCase()), body),
  ),

  // People
  api.post(
    "employees",
    { auth: "staff", body: z.object({ phone, fullName: z.string().min(2).max(120), personnelCode: z.string().min(1).max(16), title: z.string().max(120).nullable().optional(), hourlyCost: z.number().int().min(0).optional(), roleIds: z.array(uuid).max(20), password: z.string().min(8).max(200) }) },
    async ({ ctx, body }) => createEmployee(ctx, body),
  ),
  api.patch(
    "employees/:id",
    { auth: "staff", body: z.object({ fullName: z.string().min(2).max(120).optional(), title: z.string().max(120).nullable().optional(), hourlyCost: z.number().int().min(0).optional(), isActive: z.boolean().optional() }) },
    async ({ ctx, params, body }) => updateEmployee(ctx, params.id!, body),
  ),
  api.put("employees/:id/roles", { auth: "staff", body: z.object({ roleIds: z.array(uuid).max(20) }) }, async ({ ctx, params, body }) => setEmployeeRoles(ctx, params.id!, body.roleIds)),
  api.post("employees/:id/password", { auth: "staff", body: z.object({ password: z.string().min(8).max(200) }) }, async ({ ctx, params, body }) => resetEmployeePassword(ctx, params.id!, body.password)),
  api.post(
    "roles",
    { auth: "staff", body: z.object({ id: uuid.optional(), code: z.string().max(48), name: z.string().min(2).max(80), description: z.string().max(300).nullable().optional(), permissions: z.array(z.string().max(64)).max(100), workspaces: z.array(z.string().max(32)).max(20), stepTypes: z.array(z.string().max(32)).max(40) }) },
    async ({ ctx, body }) => upsertRole(ctx, body),
  ),
  api.post(
    "customers",
    { auth: "staff", body: z.object({ phone, fullName: z.string().min(2).max(120), type: z.enum(["INDIVIDUAL", "COMPANY"]).optional(), companyName: z.string().max(160).nullable().optional(), nationalId: z.string().max(11).nullable().optional(), economicCode: z.string().max(16).nullable().optional(), email: z.string().email().nullable().optional(), notes: z.string().max(1000).nullable().optional() }) },
    async ({ ctx, body }) => createCustomer(ctx, body),
  ),
  api.patch(
    "customers/:id",
    { auth: "any", body: z.object({ fullName: z.string().min(2).max(120).optional(), type: z.enum(["INDIVIDUAL", "COMPANY"]).optional(), companyName: z.string().max(160).nullable().optional(), nationalId: z.string().max(11).nullable().optional(), economicCode: z.string().max(16).nullable().optional(), email: z.string().email().nullable().optional(), notes: z.string().max(1000).nullable().optional(), discountPct: z.number().min(0).max(100).optional(), creditLimit: z.number().int().min(0).optional() }) },
    async ({ ctx, params, body }) => updateCustomer(ctx, params.id!, body),
  ),

  // Catalog
  api.post("catalog/products", { auth: "staff", body: z.unknown() }, async ({ ctx, body }) => ({ id: await saveProduct(ctx, null, body) })),
  api.put("catalog/products/:id", { auth: "staff", body: z.unknown() }, async ({ ctx, params, body }) => ({ id: await saveProduct(ctx, params.id!, body) })),
  api.post("catalog/products/:id/active", { auth: "staff", body: z.object({ isActive: z.boolean() }) }, async ({ ctx, params, body }) => setProductActive(ctx, params.id!, body.isActive)),
  api.post(
    "catalog/categories",
    { auth: "staff", body: z.object({ id: uuid.optional(), slug: z.string().max(80), name: z.string().min(2).max(80), description: z.string().max(300).nullable().optional(), icon: z.string().max(32).nullable().optional(), sortOrder: z.number().int().optional(), isActive: z.boolean().optional() }) },
    async ({ ctx, body }) => upsertCategory(ctx, body),
  ),

  // Pricing (versioned)
  api.get("pricing/rule-sets", { auth: "staff" }, async ({ ctx }) => listRuleSets(ctx)),
  api.get("pricing/versions/:id", { auth: "staff" }, async ({ ctx, params }) => getRuleVersion(ctx, params.id!)),
  api.post("pricing/versions/:id/draft", { auth: "staff", body: z.object({ notes: z.string().max(500).optional() }) }, async ({ ctx, params, body }) => createDraft(ctx, params.id!, body.notes)),
  api.put("pricing/versions/:id", { auth: "staff", body: z.object({ data: z.unknown(), notes: z.string().max(500).optional() }) }, async ({ ctx, params, body }) => updateDraft(ctx, params.id!, body.data, body.notes)),
  api.post("pricing/versions/:id/publish", { auth: "staff" }, async ({ ctx, params }) => publishDraft(ctx, params.id!)),
  api.post("pricing/versions/:id/discard", { auth: "staff" }, async ({ ctx, params }) => discardDraft(ctx, params.id!)),
  api.post(
    "pricing/simulate",
    { auth: "staff", body: z.object({ versionId: uuid, productId: uuid, quantity: z.number().int().positive(), selections, urgency, forceMethod: z.string().max(24).optional() }) },
    async ({ ctx, body }) => {
      assertCan(ctx, "pricing.view");
      return priceProduct(ctx.db, { productId: body.productId, quantity: body.quantity, selections: body.selections, urgency: body.urgency, ruleVersionId: body.versionId, forceMethod: body.forceMethod });
    },
  ),

  // Workflows (versioned)
  api.get("workflows", { auth: "staff" }, async ({ ctx }) => listTemplates(ctx)),
  api.get("workflows/:id", { auth: "staff" }, async ({ ctx, params }) => getTemplate(ctx, params.id!)),
  api.post("workflows/:id/draft", { auth: "staff" }, async ({ ctx, params }) => ({ id: await createTemplateDraft(ctx, params.id!) })),
  api.put("workflows/:id", { auth: "staff", body: z.object({ name: z.string().max(120).optional(), description: z.string().max(500).nullable().optional(), steps: z.unknown() }) }, async ({ ctx, params, body }) => saveTemplateDraft(ctx, params.id!, body)),
  api.post("workflows/:id/activate", { auth: "staff" }, async ({ ctx, params }) => activateTemplate(ctx, params.id!)),

  // Settings
  api.put("settings/:key", { auth: "staff", body: z.unknown() }, async ({ ctx, params, body }) => updateSetting(ctx, z.enum(Object.keys(settingsSchemas) as ["business", "orders"]).parse(params.key), body)),
];
