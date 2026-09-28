import Link from "next/link";
import type { Metadata } from "next";
import { History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Code, DateText, EmptyState } from "@/components/ui/misc";
import { PageHeader } from "@/components/panel/page";
import { Pagination } from "@/components/panel/pagination";
import { formatNumber } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { listAudit } from "@/server/modules/audit/audit";

export const metadata: Metadata = { title: "گزارش ممیزی" };

const ENTITY_LABEL: Record<string, string> = {
  order: "سفارش", order_item: "قلم سفارش", payment: "پرداخت", shipment: "مرسوله", material: "کالا", material_requirement: "نیاز مواد", material_request: "درخواست خرید",
  purchase_order: "سفارش خرید", production_task: "مرحله تولید", production_job: "کار تولید", employee: "کارمند", role: "نقش", customer: "مشتری", product: "محصول",
  pricing_version: "قیمت‌گذاری", workflow_template: "گردش‌کار", setting: "تنظیمات", machine: "ماشین", quote: "پیش‌فاکتور", inquiry: "استعلام", artwork_version: "نسخه فایل",
};

const hrefFor = (type: string, id: string) =>
  type === "order" ? `/panel/orders/${id}` : type === "customer" ? `/panel/customers/${id}` : type === "employee" ? `/panel/employees/${id}` : type === "material" ? `/panel/inventory/${id}` : type === "quote" ? `/panel/sales/quotes/${id}` : type === "product" ? `/panel/catalog/${id}` : null;

function Json({ value }: { value: unknown }) {
  if (value == null) return <span className="text-subtle">—</span>;
  return <pre dir="ltr" className="scrollbar-thin max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 text-left text-[11.5px] leading-5">{JSON.stringify(value, null, 2)}</pre>;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ type?: string; action?: string; actor?: string; entity?: string; page?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ permission: "audit.view" });
  const page = Number(sp.page ?? 1) || 1;
  const { rows, total, pageSize, entityTypes } = await listAudit(ctx, { entityType: sp.type, action: sp.action, actor: sp.actor && /^[0-9a-f-]{36}$/i.test(sp.actor) ? sp.actor : undefined, entityId: sp.entity && /^[0-9a-f-]{36}$/i.test(sp.entity) ? sp.entity : undefined, page });
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ type: sp.type, action: sp.action, actor: sp.actor, entity: sp.entity, ...extra })) if (v) p.set(k, v);
    return `/panel/audit?${p.toString()}`;
  };
  return (
    <>
      <PageHeader title="گزارش ممیزی" description={`${formatNumber(total)} رویداد • ثبت‌ها غیرقابل ویرایش و حذف‌اند (محافظت در سطح پایگاه داده).`} />
      <form className="mb-4 flex flex-wrap items-end gap-2" action="/panel/audit">
        <label className="text-[12.5px] font-bold text-muted">نوع موجودیت
          <select name="type" defaultValue={sp.type ?? ""} className="mt-1 block h-9 rounded-lg border border-line-strong bg-surface px-2 text-[13px]">
            <option value="">همه</option>
            {entityTypes.map((t) => <option key={t} value={t}>{ENTITY_LABEL[t] ?? t}</option>)}
          </select>
        </label>
        <label className="text-[12.5px] font-bold text-muted">عملیات (پیشوند)
          <input name="action" defaultValue={sp.action ?? ""} dir="ltr" placeholder="order.cancel" className="mt-1 block h-9 w-44 rounded-lg border border-line-strong bg-surface px-2 text-[13px]" />
        </label>
        {sp.actor && <input type="hidden" name="actor" value={sp.actor} />}
        {sp.entity && <input type="hidden" name="entity" value={sp.entity} />}
        <button className="h-9 rounded-lg bg-ink px-4 text-[13px] font-bold text-surface">اعمال</button>
        {(sp.type || sp.action || sp.actor || sp.entity) && <Link href="/panel/audit" className="h-9 px-2 py-2 text-[13px] font-bold text-accent-ink">حذف فیلترها</Link>}
      </form>
      <Card className="overflow-hidden">
        {rows.length === 0 ? <EmptyState icon={<History />} title="رویدادی پیدا نشد" /> : (
          <ul className="divide-y divide-line">
            {rows.map((a) => {
              const href = hrefFor(a.entityType, a.entityId);
              const reason = a.context?.reason as string | undefined;
              return (
                <li key={a.id}>
                  <details className="group px-5 py-3">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                      <DateText value={a.createdAt} withTime className="w-32 text-muted" />
                      <Code className="font-bold">{a.action}</Code>
                      <span className="text-muted">{ENTITY_LABEL[a.entityType] ?? a.entityType}</span>
                      {href ? <Link href={href} className="text-[12px] text-accent-ink hover:underline">مشاهده</Link> : null}
                      <Link href={qs({ actor: a.actorUserId ?? undefined, page: undefined })} className="ms-auto font-bold hover:text-accent-ink">{a.actorLabel}</Link>
                      {reason && <span className="w-full text-[12.5px] text-ink-2">دلیل: {reason}</span>}
                    </summary>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div><p className="mb-1 text-[12px] font-bold text-muted">قبل</p><Json value={a.before} /></div>
                      <div><p className="mb-1 text-[12px] font-bold text-muted">بعد</p><Json value={a.after} /></div>
                      <p className="text-[11.5px] text-subtle lg:col-span-2" dir="ltr">entity {a.entityId} • request {String(a.context?.requestId ?? "—")} • ip {String(a.context?.ip ?? "—")}</p>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} href={(p) => qs({ page: String(p) })} />
      </Card>
    </>
  );
}
