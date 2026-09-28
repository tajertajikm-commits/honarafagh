import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { workflowTemplateSteps, workflowTemplates } from "@/server/db/schema";
import { type Ctx, actorUserId, assertCan, inTx } from "@/server/core/context";
import { invalidState, notFound, validation } from "@/server/core/errors";
import { audit } from "@/server/modules/audit/audit";
import { validateTemplate } from "./graph";
import { templateStepInputSchema, type TemplateStepInput } from "./types";

export async function listTemplates(ctx: Ctx) {
  assertCan(ctx, "production.view");
  return ctx.db.select().from(workflowTemplates).orderBy(asc(workflowTemplates.code), desc(workflowTemplates.version));
}

export async function getTemplate(ctx: Ctx, templateId: string) {
  assertCan(ctx, "production.view");
  const [tpl] = await ctx.db.select().from(workflowTemplates).where(eq(workflowTemplates.id, templateId));
  if (!tpl) throw notFound("گردش‌کار");
  const steps = await ctx.db.select().from(workflowTemplateSteps).where(eq(workflowTemplateSteps.templateId, templateId)).orderBy(asc(workflowTemplateSteps.sortOrder));
  return { template: tpl, steps: steps.map(toInput) };
}

const toInput = (s: typeof workflowTemplateSteps.$inferSelect): TemplateStepInput => ({
  key: s.key,
  name: s.name,
  stepType: s.stepTypeCode,
  dependsOn: s.dependsOn,
  condition: s.condition,
  gate: s.gate ?? null,
  machineType: s.machineTypeCode,
  defaultMinutes: s.defaultMinutes,
  minLagMinutes: s.minLagMinutes,
  isQc: s.isQc,
  reworkTargets: s.reworkTargets,
  milestone: s.milestone as TemplateStepInput["milestone"],
  checklist: s.checklist,
});

/** New editable version of a template. Running jobs keep the version they were created from. */
export async function createTemplateDraft(ctx: Ctx, fromTemplateId: string) {
  assertCan(ctx, "workflow.edit");
  return inTx(ctx, async (tx) => {
    const src = await getTemplate(tx, fromTemplateId);
    const [draft] = await tx.db.select({ id: workflowTemplates.id }).from(workflowTemplates).where(and(eq(workflowTemplates.code, src.template.code), eq(workflowTemplates.status, "DRAFT")));
    if (draft) return draft.id;
    const [{ max }] = (await tx.db.select({ max: sql<number>`max(${workflowTemplates.version})::int` }).from(workflowTemplates).where(eq(workflowTemplates.code, src.template.code))) as [{ max: number }];
    const [tpl] = await tx.db
      .insert(workflowTemplates)
      .values({ code: src.template.code, version: max + 1, name: src.template.name, methodCode: src.template.methodCode, status: "DRAFT", description: src.template.description, createdBy: actorUserId(tx) })
      .returning();
    await insertSteps(tx, tpl!.id, src.steps);
    await audit(tx, { action: "workflow.draft", entityType: "workflow_template", entityId: tpl!.id, after: { code: tpl!.code, version: tpl!.version } });
    return tpl!.id;
  });
}

async function insertSteps(ctx: Ctx, templateId: string, steps: TemplateStepInput[]) {
  if (steps.length === 0) return;
  await ctx.db.insert(workflowTemplateSteps).values(
    steps.map((s, i) => ({
      templateId,
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

export async function saveTemplateDraft(ctx: Ctx, templateId: string, input: { name?: string; description?: string | null; steps: unknown }) {
  assertCan(ctx, "workflow.edit");
  const parsed = z.array(templateStepInputSchema).safeParse(input.steps);
  if (!parsed.success) throw validation("مراحل گردش‌کار نامعتبر است.", parsed.error.issues);
  const issues = validateTemplate(parsed.data);
  if (issues.length) throw validation("گردش‌کار ایراد ساختاری دارد.", issues);
  return inTx(ctx, async (tx) => {
    const [tpl] = await tx.db.select().from(workflowTemplates).where(eq(workflowTemplates.id, templateId)).for("update");
    if (!tpl) throw notFound("گردش‌کار");
    if (tpl.status !== "DRAFT") throw invalidState("فقط پیش‌نویس قابل ویرایش است.");
    const before = await getTemplate(tx, templateId);
    await tx.db.update(workflowTemplates).set({ name: input.name ?? tpl.name, description: input.description ?? tpl.description }).where(eq(workflowTemplates.id, templateId));
    await tx.db.delete(workflowTemplateSteps).where(eq(workflowTemplateSteps.templateId, templateId));
    await insertSteps(tx, templateId, parsed.data);
    await audit(tx, { action: "workflow.edit", entityType: "workflow_template", entityId: templateId, before: before.steps, after: parsed.data });
  });
}

export async function activateTemplate(ctx: Ctx, templateId: string) {
  assertCan(ctx, "workflow.edit");
  return inTx(ctx, async (tx) => {
    const { template, steps } = await getTemplate(tx, templateId);
    if (template.status !== "DRAFT") throw invalidState("فقط پیش‌نویس قابل فعال‌سازی است.");
    const issues = validateTemplate(steps);
    if (issues.length) throw validation("گردش‌کار ایراد ساختاری دارد.", issues);
    await tx.db.update(workflowTemplates).set({ status: "ARCHIVED" }).where(and(eq(workflowTemplates.code, template.code), eq(workflowTemplates.status, "ACTIVE")));
    await tx.db.update(workflowTemplates).set({ status: "ACTIVE" }).where(eq(workflowTemplates.id, templateId));
    await audit(tx, { action: "workflow.activate", entityType: "workflow_template", entityId: templateId, after: { code: template.code, version: template.version } });
  });
}
