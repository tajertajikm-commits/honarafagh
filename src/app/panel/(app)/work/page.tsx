import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BadgeCheck, ChevronLeft, ClipboardCheck, Factory, FileSearch, Palette, Printer, Receipt, ScrollText, Sparkles, Wallet, MessageCircleQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DateText, Money, OrderCode } from "@/components/ui/misc";
import { ActionButton } from "@/components/panel/actions";
import { PageHeader } from "@/components/panel/page";
import { PriorityFlag, TypeChip } from "@/components/panel/chips";
import { StepActions, type StepView } from "@/components/panel/step-actions";
import { can } from "@/server/core/context";
import { requireStaffPage } from "@/server/http/session";
import { listMachines, listMaterials } from "@/server/modules/materials/service";
import { myWork, type QueueItem, type WorkOrderRef } from "@/server/modules/queues/service";
import { station } from "@/server/modules/workflow/stations";
import { ARTWORK_STATUS, PAYMENT_METHOD, label } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";

export const metadata: Metadata = { title: "کارهای من" };

export default async function WorkPage() {
  const ctx = await requireStaffPage();
  const w = await myWork(ctx);
  const materials = can(ctx, "digital.production") ? (await listMaterials(ctx, { category: ["PAPER", "CARDBOARD"] })).map((m) => ({ id: m.id, name: m.name, unit: m.unit, stock: m.stock, category: m.category })) : [];
  const machines = can(ctx, "offset.press.assign") ? await listMachines(ctx) : [];
  const quality = w.stations.filter((g) => g.station.kind === "QUALITY");
  const work = w.stations.filter((g) => g.station.kind !== "QUALITY");
  const first = ctx.actor.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="کارهای من"
        description={w.total === 0 ? `${first} عزیز، الان کاری منتظر شما نیست.` : `${first} عزیز، ${formatNumber(w.total)} کار منتظر شماست. فوری‌ها بالاتر هستند.`}
      />
      {w.total === 0 && (
        <div className="grid place-items-center rounded-3xl border border-line bg-surface px-6 py-20 text-center shadow-soft">
          <Sparkles className="size-10 text-brand-amber" />
          <p className="mt-4 text-[17px] font-bold">همه کارها انجام شده است</p>
          <p className="mt-1 text-[13.5px] text-muted">کار جدید که برسد، همین‌جا و در اعلان‌ها نمایش داده می‌شود.</p>
        </div>
      )}

      <div className="space-y-5">
        {w.approvals.length > 0 && (
          <Section icon={<ClipboardCheck />} title="سفارش‌های منتظر تأیید" hint="مشخصات و فایل را بررسی کنید و ایستگاه‌های لازم را انتخاب کنید." count={w.approvals.length}>
            {w.approvals.map((o) => (
              <OrderRow key={o.id} o={o} meta={<DateText value={o.createdAt} relative className="text-[12px] text-muted" />} action={<OpenButton href={`/panel/orders/${o.code}`} label="بررسی و تأیید" primary />} />
            ))}
          </Section>
        )}

        {w.paperDecisions.length > 0 && (
          <Section icon={<ScrollText />} title="انتخاب تأمین‌کننده کاغذ" hint="قیمت‌ها ثبت شده؛ تأمین‌کننده را انتخاب کنید." count={w.paperDecisions.length}>
            {w.paperDecisions.map((o) => (
              <OrderRow key={o.id} o={o} action={<OpenButton href={`/panel/orders/${o.code}?tab=procurement`} label="مقایسه قیمت‌ها" primary />} />
            ))}
          </Section>
        )}

        {quality.map((g) => (
          <Section key={g.station.key} icon={<BadgeCheck />} title={g.station.name} hint={g.station.hint} count={g.items.length}>
            {g.items.map((i) => (
              <StepRow key={i.stepId} item={i} action={<StepActions step={toView(i)} canPerform />} />
            ))}
          </Section>
        ))}

        {w.artworkReviews.length > 0 && (
          <Section icon={<FileSearch />} title="فایل‌های منتظر بررسی" hint="فایل را برای چاپ تأیید کنید یا ایراد آن را به مشتری بگویید." count={w.artworkReviews.length}>
            {w.artworkReviews.map((o) => (
              <OrderRow key={o.id} o={o} action={<OpenButton href={`/panel/orders/${o.code}?tab=files`} label="بررسی فایل" primary />} />
            ))}
          </Section>
        )}

        {w.design.length > 0 && (
          <Section icon={<Palette />} title="طراحی" hint="طرح را بارگذاری کنید و «طراحی انجام شد» را بزنید." count={w.design.length}>
            {w.design.map((o) => (
              <OrderRow
                key={o.id}
                o={o}
                meta={<Badge tone="violet">{label(ARTWORK_STATUS, o.artworkStatus)}</Badge>}
                action={
                  <div className="flex gap-2">
                    {o.artworkStatus === "DESIGN_REQUESTED" && <ActionButton path={`orders/${o.id}/design/start`} success="طراحی شروع شد." size="sm" variant="secondary">شروع طراحی</ActionButton>}
                    <OpenButton href={`/panel/orders/${o.code}?tab=files`} label="فایل‌ها" primary />
                  </div>
                }
              />
            ))}
          </Section>
        )}

        {w.pressAssignment.length > 0 && (
          <Section icon={<Printer />} title="تعیین ماشین چاپ" hint="ماشین تک‌رنگ، چهاررنگ یا هشت‌رنگ را برای هر کار انتخاب کنید." count={w.pressAssignment.length}>
            {w.pressAssignment.map((i) => (
              <StepRow key={i.stepId} item={i} action={<StepActions step={{ ...toView(i), status: "READY" }} canPerform={false} canAssignPress machines={machines} />} />
            ))}
          </Section>
        )}

        {work.map((g) => (
          <Section key={g.station.key} icon={<StationIcon type={g.station.type} />} title={`${g.station.name} — ${g.station.type === "DIGITAL" ? "دیجیتال" : "افست"}`} hint={g.station.hint} count={g.items.length}>
            {g.items.map((i) => (
              <StepRow key={i.stepId} item={i} action={<StepActions step={toView(i)} canPerform canAssignPress={can(ctx, "offset.press.assign")} materials={materials} machines={machines} />} />
            ))}
          </Section>
        ))}

        {w.pricing.length > 0 && (
          <Section icon={<Receipt />} title="سفارش‌های بدون قیمت" hint="مبلغ را تعیین کنید تا مشتری بتواند پرداخت کند." count={w.pricing.length}>
            {w.pricing.map((o) => (
              <OrderRow key={o.id} o={o} action={<OpenButton href={`/panel/orders/${o.code}?tab=finance`} label="تعیین مبلغ" primary />} />
            ))}
          </Section>
        )}

        {w.payments.length > 0 && (
          <Section icon={<Wallet />} title="پرداخت‌های منتظر تأیید" count={w.payments.length}>
            {w.payments.map((p) => (
              <Row
                key={p.id}
                left={
                  <>
                    <Link href={`/panel/orders/${p.orderCode}?tab=finance`} className="hover:underline"><OrderCode code={p.orderCode} /></Link>
                    <span className="text-[13px] text-muted">{p.customerName}</span>
                  </>
                }
                meta={<span className="text-[13px]"><Money rial={p.amount} strong /> • {PAYMENT_METHOD[p.method]}</span>}
                action={
                  <div className="flex gap-2">
                    <ActionButton path={`payments/${p.id}/approve`} success="پرداخت تأیید شد." size="sm">تأیید</ActionButton>
                  </div>
                }
              />
            ))}
          </Section>
        )}

        {w.waitingCustomer.length > 0 && (
          <Section icon={<MessageCircleQuestion />} title="منتظر پاسخ مشتری" hint="از مشتری توضیح خواسته‌اید؛ پاسخ که برسد دوباره به تأیید برمی‌گردد." count={w.waitingCustomer.length} quiet>
            {w.waitingCustomer.map((o) => (
              <OrderRow key={o.id} o={o} action={<OpenButton href={`/panel/orders/${o.code}`} label="مشاهده" />} />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
}

function toView(i: QueueItem): StepView {
  const st = station(i.key);
  return { id: i.stepId, key: i.key, name: st.name, kind: st.kind, status: i.status, machineId: i.machineId, blocked: i.blocked, orderCode: i.order.code };
}

function StationIcon({ type }: { type: string }) {
  return type === "DIGITAL" ? <Printer /> : <Factory />;
}

function Section({ icon, title, hint, count, children, quiet }: { icon: ReactNode; title: string; hint?: string; count: number; children: ReactNode; quiet?: boolean }) {
  return (
    <section className={quiet ? "rounded-2xl border border-dashed border-line-strong bg-transparent" : "overflow-hidden rounded-2xl border border-line bg-surface shadow-card"}>
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2 [&_svg]:size-[18px]">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15.5px] font-bold">
            {title} <span className="ms-1 rounded-full bg-ink px-2 py-0.5 text-[11.5px] text-surface tabular">{formatNumber(count)}</span>
          </h2>
          {hint && <p className="text-[12.5px] text-muted">{hint}</p>}
        </div>
      </header>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}

function Row({ left, meta, action, highlight }: { left: ReactNode; meta?: ReactNode; action?: ReactNode; highlight?: boolean }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 ${highlight ? "bg-danger-soft/40" : ""}`}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">{left}</div>
      {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
      {action && <div className="ms-auto">{action}</div>}
    </li>
  );
}

function OrderRow({ o, meta, action }: { o: WorkOrderRef; meta?: ReactNode; action?: ReactNode }) {
  return (
    <Row
      highlight={o.isPriority}
      left={
        <>
          <Link href={`/panel/orders/${o.code}`} className="hover:underline"><OrderCode code={o.code} /></Link>
          <TypeChip type={o.productionType} />
          {o.isPriority && <PriorityFlag />}
          <span className="min-w-0 truncate text-[14px] font-bold">{o.title}</span>
          <span className="text-[13px] text-muted">{o.customerName}</span>
        </>
      }
      meta={meta}
      action={action}
    />
  );
}

function StepRow({ item, action }: { item: QueueItem; action: ReactNode }) {
  return (
    <Row
      highlight={item.order.isPriority}
      left={
        <>
          <Link href={`/panel/orders/${item.order.code}`} className="hover:underline"><OrderCode code={item.order.code} /></Link>
          {item.order.isPriority && <PriorityFlag />}
          <span className="min-w-0 truncate text-[14px] font-bold">{item.order.title}</span>
          <span className="text-[13px] text-muted">{item.order.customerName}{item.order.quantity ? ` • ${formatNumber(item.order.quantity)} عدد` : ""}</span>
        </>
      }
      meta={
        <>
          {item.status === "IN_PROGRESS" && <Badge tone="accent" dot pulse>در حال انجام{item.assigneeName ? ` — ${item.assigneeName}` : ""}</Badge>}
          {item.reworkCount > 0 && <Badge tone="danger">دوباره‌کاری</Badge>}
          {item.machineName && <Badge tone="neutral">{item.machineName}</Badge>}
          {item.blocked && <Badge tone="warning">{item.blocked}</Badge>}
          {item.detail && <span className="text-[12.5px] text-muted">{item.detail}</span>}
        </>
      }
      action={action}
    />
  );
}

function OpenButton({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Button asChild size="sm" variant={primary ? "primary" : "secondary"}>
      <Link href={href}>
        {label} <ChevronLeft className="size-3.5" />
      </Link>
    </Button>
  );
}
