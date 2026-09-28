import Link from "next/link";
import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/panel/page";
import { WorkflowEditor, type StepDef } from "@/components/panel/workflow-editor";
import { cn } from "@/lib/cn";
import { METHOD } from "@/lib/labels";
import { toFaDigits } from "@/lib/persian";
import { machineTypes, stepTypes } from "@/server/db/schema";
import { requireStaffPage } from "@/server/http/session";
import { getTemplate, listTemplates } from "@/server/modules/workflow/admin";

export const metadata: Metadata = { title: "گردش‌کار تولید" };

const STATUS: Record<string, [string, "success" | "warning" | "neutral"]> = { ACTIVE: ["فعال", "success"], DRAFT: ["پیش‌نویس", "warning"], ARCHIVED: ["بایگانی", "neutral"] };

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ permission: "workflow.edit" });
  const all = await listTemplates(ctx);
  const byCode = new Map<string, typeof all>();
  for (const t of all) byCode.set(t.code, [...(byCode.get(t.code) ?? []), t]);
  const selectedId = (sp.id && all.some((t) => t.id === sp.id) ? sp.id : undefined) ?? all.find((t) => t.status === "DRAFT")?.id ?? all.find((t) => t.status === "ACTIVE")?.id;
  const selected = selectedId ? await getTemplate(ctx, selectedId) : null;
  const sts = await ctx.db.select().from(stepTypes).orderBy(asc(stepTypes.sortOrder));
  const mts = await ctx.db.select().from(machineTypes).orderBy(asc(machineTypes.name));
  return (
    <>
      <PageHeader title="گردش‌کار تولید" description="مراحل تولید هر روش (افست، دیجیتال) با وابستگی، مسیرهای موازی، دروازه‌های خودکار و مراحل شرطی. تغییرات نسخه‌دار است و کارهای در جریان را تغییر نمی‌دهد." />
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden">
          {[...byCode.entries()].map(([code, versions]) => (
            <div key={code} className="border-b border-line last:border-b-0">
              <p className="px-4 pt-3 text-[13px] font-bold">{versions[0]!.name}<span className="block text-[11.5px] font-medium text-muted">{versions[0]!.methodCode ? METHOD[versions[0]!.methodCode] : "عمومی"} • <bdi dir="ltr">{code}</bdi></span></p>
              <ul className="py-2">
                {versions.map((v) => (
                  <li key={v.id}>
                    <Link href={`/panel/workflows?id=${v.id}`} className={cn("flex items-center justify-between px-4 py-1.5 text-[12.5px]", v.id === selectedId ? "bg-surface-2 font-bold" : "hover:bg-surface-2/60")}>
                      نسخه {toFaDigits(v.version)} <Badge tone={STATUS[v.status]?.[1] ?? "neutral"}>{STATUS[v.status]?.[0] ?? v.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
        {selected ? (
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-bold">{selected.template.name} • نسخه {toFaDigits(selected.template.version)}</h2>
              <Badge tone={STATUS[selected.template.status]?.[1] ?? "neutral"}>{STATUS[selected.template.status]?.[0]}</Badge>
            </div>
            {selected.template.description && <p className="mb-4 max-w-3xl text-[13.5px] leading-7 text-muted">{selected.template.description}</p>}
            <WorkflowEditor
              key={selected.template.id}
              templateId={selected.template.id}
              status={selected.template.status}
              name={selected.template.name}
              initialSteps={selected.steps as StepDef[]}
              stepTypes={sts.map((s) => ({ code: s.code, name: s.name, machineTypeCode: s.machineTypeCode }))}
              machineTypes={mts.map((m) => ({ code: m.code, name: m.name }))}
              canEdit={ctx.actor.permissions.has("workflow.edit")}
            />
          </div>
        ) : <Card className="p-8 text-center text-muted">گردش‌کاری تعریف نشده است.</Card>}
      </div>
    </>
  );
}
