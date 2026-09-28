import Link from "next/link";
import type { Metadata } from "next";
import { FileCheck2, FileClock, Palette, PenTool } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DateText, EmptyState, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { ArtworkPanel } from "@/components/panel/order/artwork-panel";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { cn } from "@/lib/cn";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { formatNumber, toFaDigits } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { artworkForItems, prepressQueue, studioQueue } from "@/server/modules/files/queries";

export const metadata: Metadata = { title: "طراحی و پیش از چاپ" };

const TABS = [
  { key: "review", label: "بررسی فایل", status: ["UNDER_REVIEW"] },
  { key: "design", label: "طراحی", status: ["IN_DESIGN"] },
  { key: "revision", label: "اصلاح / منتظر فایل", status: ["NEEDS_REVISION", "AWAITING_FILE"] },
  { key: "customer", label: "منتظر تأیید مشتری", status: ["AWAITING_CUSTOMER_APPROVAL"] },
  { key: "prepress", label: "پیش از چاپ و زینک", status: [] },
] as const;

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ tab?: string; item?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ workspace: "studio", anyOf: ["file.view", "file.review", "file.upload"] });
  const perms = [...ctx.actor.permissions];
  const queue = await studioQueue(ctx);
  const prepress = (await prepressQueue(ctx)).rows;
  const count = (k: string) => (k === "prepress" ? prepress.length : queue.filter((q) => (TABS.find((t) => t.key === k)!.status as readonly string[]).includes(q.item.fileStatus)).length);
  const defaultTab = TABS.find((t) => count(t.key) > 0)?.key ?? "review";
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS.find((t) => t.key === defaultTab)!;
  const rows = queue.filter((q) => (tab.status as readonly string[]).includes(q.item.fileStatus));
  const selected = rows.find((r) => r.item.id === sp.item) ?? rows[0];
  const versions = selected ? await artworkForItems(ctx, [selected.item.id]) : [];

  return (
    <>
      <PageHeader title="طراحی و پیش از چاپ" description="بررسی فنی فایل مشتری، طراحی و ارسال نمونه برای تأیید، و تحویل فایل تأییدشده به پیش از چاپ" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="منتظر بررسی فنی" value={formatNumber(count("review"))} tone={count("review") ? "accent" : "neutral"} icon={<FileClock />} href="/panel/studio?tab=review" />
        <Stat label="در حال طراحی" value={formatNumber(count("design"))} icon={<PenTool />} href="/panel/studio?tab=design" />
        <Stat label="منتظر تأیید مشتری" value={formatNumber(count("customer"))} icon={<Palette />} href="/panel/studio?tab=customer" />
        <Stat label="پیش از چاپ و زینک" value={formatNumber(prepress.length)} icon={<FileCheck2 />} href="/panel/studio?tab=prepress" />
      </div>
      <FilterTabs active={tab.key} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/panel/studio?tab=${t.key}`, count: count(t.key) }))} />

      {tab.key === "prepress" ? (
        <Card className="overflow-hidden">
          {prepress.length === 0 ? <EmptyState icon={<FileCheck2 />} title="کاری در صف پیش از چاپ نیست" /> : (
            <ul className="divide-y divide-line">
              {prepress.map((t) => (
                <li key={t.task_id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-[13px]">
                  <Link href={`/panel/orders/${t.order_id}`} className="hover:text-accent-ink"><OrderNo n={t.number} /></Link>
                  <span className="font-bold">{t.name}</span>
                  <span className="text-muted">{t.title}</span>
                  <Status map={TASK_STATUS} value={t.status} />
                  <span className="ms-auto text-muted">{t.assignee ?? "بدون مسئول"} • موعد <DateText value={t.due_date} /></span>
                  <Button asChild size="xs" variant="secondary"><Link href="/panel/station">ایستگاه کار</Link></Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={<FileCheck2 />} title="صف خالی است" description="موردی در این مرحله نیست." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
          <Card className="h-fit overflow-hidden">
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const active = r.item.id === selected?.item.id;
                const overdue = r.order.dueDate && r.order.dueDate < new Date();
                return (
                  <li key={r.item.id}>
                    <Link href={`/panel/studio?tab=${tab.key}&item=${r.item.id}`} className={cn("block px-4 py-3 transition-colors", active ? "bg-surface-2" : "hover:bg-surface-2/60")} aria-current={active ? "true" : undefined}>
                      <div className="flex items-center gap-2">
                        <OrderNo n={r.order.number} className="text-[13px]" />
                        {r.order.priority !== "NORMAL" && <Status map={PRIORITY} value={r.order.priority} />}
                        {r.item.needsDesign && <Badge tone="violet">طراحی</Badge>}
                        <span className={cn("ms-auto text-[12px]", overdue ? "font-bold text-danger" : "text-muted")}><DateText value={r.order.dueDate} /></span>
                      </div>
                      <p className="mt-0.5 truncate text-[13.5px] font-bold">{r.item.title} <span className="font-medium text-muted">× {formatNumber(r.item.quantity)}</span></p>
                      <p className="text-[12px] text-muted">
                        {r.customerName} • {r.versions ? `${toFaDigits(r.versions)} نسخه` : "بدون فایل"}
                        {r.designTask && <> • طراحی: {TASK_STATUS[r.designTask]?.[0]}{(r.designAttempt ?? 1) > 1 && ` (دور ${toFaDigits(r.designAttempt!)})`}</>}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
          {selected && (
            <Card>
              <CardHeader
                title={<>سفارش {toFaDigits(selected.order.number)} • {selected.customerName}</>}
                description={<>تیراژ {formatNumber(selected.item.quantity)} • {selected.designAssignee ? `طراح: ${selected.designAssignee}` : selected.item.needsDesign ? "طراح تعیین نشده" : "فایل از مشتری"} • موعد <DateText value={selected.order.dueDate} /></>}
                actions={<Button asChild size="xs" variant="secondary"><Link href={`/panel/orders/${selected.order.id}`}>مشاهده سفارش</Link></Button>}
              />
              <CardBody className="pt-0">
                <ArtworkPanel
                  perms={perms}
                  items={[{ id: selected.item.id, title: selected.item.title, fileStatus: selected.item.fileStatus, needsDesign: selected.item.needsDesign }]}
                  versions={versions.map((a) => ({ id: a.version.id, itemId: a.version.orderItemId, versionNo: a.version.versionNo, stage: a.version.stage, status: a.version.status, note: a.version.note, reviewNote: a.version.reviewNote, customerComment: a.version.customerComment, createdAt: a.version.createdAt.toISOString(), uploader: a.uploader, file: a.file }))}
                />
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
