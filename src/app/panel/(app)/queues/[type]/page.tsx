import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { DateText, OrderCode } from "@/components/ui/misc";
import { PageHeader } from "@/components/panel/page";
import { PriorityFlag } from "@/components/panel/chips";
import { requireStaffPage } from "@/server/http/session";
import { stationQueues, type QueueItem, type StationQueue } from "@/server/modules/queues/service";
import { MACHINE_CATEGORY } from "@/lib/labels";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/persian";

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  return { title: (await params).type === "offset" ? "صف افست" : "صف دیجیتال" };
}

export default async function QueuesPage({ params }: { params: Promise<{ type: string }> }) {
  const t = (await params).type;
  if (t !== "digital" && t !== "offset") notFound();
  const type = t === "digital" ? "DIGITAL" : "OFFSET";
  const ctx = await requireStaffPage({ anyOf: [type === "DIGITAL" ? "digital.queue" : "offset.queue", "dashboard.view"] });
  const queues = await stationQueues(ctx, type);
  const live = queues.reduce((s, q) => s + q.working + q.waiting, 0);
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={type === "DIGITAL" ? "صف ایستگاه‌های دیجیتال" : "صف ایستگاه‌های افست"}
        description={`${formatNumber(live)} کار در ایستگاه‌ها • فوری‌ها بالای هر صف هستند • مسیر هر سفارش هنگام تأیید انتخاب شده است.`}
        actions={
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
            <Link href="/panel/queues/digital" className={cn("rounded-md px-3 py-1.5 text-[13px] font-bold", type === "DIGITAL" ? "bg-surface shadow-soft" : "text-muted")}>دیجیتال</Link>
            <Link href="/panel/queues/offset" className={cn("rounded-md px-3 py-1.5 text-[13px] font-bold", type === "OFFSET" ? "bg-surface shadow-soft" : "text-muted")}>افست</Link>
          </div>
        }
      />
      {/* Load at a glance */}
      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {queues.map((q) => (
          <a key={q.station.key} href={`#${q.station.key}`} className={cn("rounded-xl border bg-surface px-3.5 py-3 shadow-soft transition-colors hover:border-line-strong", q.blocked > 0 ? "border-warning/40" : "border-line")}>
            <p className="truncate text-[12.5px] font-bold text-muted">{q.station.name}</p>
            <div className="mt-1 flex items-end gap-3">
              <span className="text-[22px] font-bold leading-none tabular">{formatNumber(q.waiting + q.working)}</span>
              <span className="pb-0.5 text-[11.5px] text-muted">
                {q.working > 0 ? `${formatNumber(q.working)} در حال انجام` : "بیکار"}
                {q.priority > 0 && <span className="ms-1 text-danger">• {formatNumber(q.priority)} فوری</span>}
              </span>
            </div>
          </a>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {queues.map((q) => (
          <StationCard key={q.station.key} q={q} />
        ))}
      </div>
    </div>
  );
}

function StationCard({ q }: { q: StationQueue }) {
  const isPrint = q.station.kind === "PRINT";
  const groups = isPrint ? groupByMachine(q.items) : [{ title: null, items: q.items }];
  return (
    <section id={q.station.key} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold">{q.station.name}</h2>
          <span className="text-[12px] text-muted">{q.station.short}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
          <Counter label="در حال انجام" n={q.working} tone="accent" />
          <Counter label="در صف" n={q.waiting} tone="neutral" />
          {q.priority > 0 && <Counter label="فوری" n={q.priority} tone="danger" />}
          {q.blocked > 0 && <Counter label="متوقف" n={q.blocked} tone="warning" />}
          {q.upcoming > 0 && <Counter label="در راه" n={q.upcoming} tone="quiet" />}
        </div>
      </header>
      {q.items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted">صف خالی است{q.upcoming > 0 ? ` • ${formatNumber(q.upcoming)} کار در مراحل قبل` : ""}.</p>
      ) : (
        groups.map((g) => (
          <div key={g.title ?? "all"}>
            {g.title && <p className="bg-surface-2/60 px-4 py-1.5 text-[11.5px] font-bold text-muted">{g.title}</p>}
            <ol className="divide-y divide-line">
              {g.items.map((i, idx) => (
                <QueueRow key={i.stepId} i={i} position={i.status === "READY" ? g.items.filter((x) => x.status === "READY").indexOf(i) + 1 : null} first={idx === 0} />
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}

function QueueRow({ i, position }: { i: QueueItem; position: number | null; first: boolean }) {
  return (
    <li className={cn("px-4 py-2.5", i.order.isPriority && "bg-danger-soft/40", i.status === "IN_PROGRESS" && "bg-accent-soft/40")}>
      <div className="flex items-center gap-2">
        <span className="w-5 text-center text-[11.5px] font-bold text-muted tabular">{i.status === "IN_PROGRESS" ? "▶" : position ? formatNumber(position) : ""}</span>
        <Link href={`/panel/orders/${i.order.code}`} className="hover:underline"><OrderCode code={i.order.code} className="text-[13px]" /></Link>
        {i.order.isPriority && <PriorityFlag compact />}
        <span className="min-w-0 flex-1 truncate text-[13px]">{i.order.title}</span>
      </div>
      <div className="ms-7 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
        <span>{i.order.customerName}</span>
        {i.status === "IN_PROGRESS" && <span className="font-bold text-accent-ink">در حال انجام{i.assigneeName ? ` — ${i.assigneeName}` : ""}</span>}
        {i.status === "READY" && i.readyAt && <span>در صف از <DateText value={i.readyAt} relative /></span>}
        {i.reworkCount > 0 && <Badge tone="danger" className="h-5 text-[11px]">دوباره‌کاری</Badge>}
        {i.blocked && <Badge tone="warning" className="h-5 text-[11px]">{i.blocked}</Badge>}
        {i.detail && <span>{i.detail}</span>}
      </div>
    </li>
  );
}

function groupByMachine(items: QueueItem[]) {
  const order = ["EIGHT_COLOR", "FOUR_COLOR", "ONE_COLOR"];
  const groups = order.map((c) => ({ title: `ماشین ${MACHINE_CATEGORY[c]}`, items: items.filter((i) => i.machineCategory === c) }));
  groups.push({ title: "ماشین تعیین نشده", items: items.filter((i) => !i.machineCategory) });
  return groups.filter((g) => g.items.length > 0);
}

function Counter({ label, n, tone }: { label: string; n: number; tone: "accent" | "neutral" | "danger" | "warning" | "quiet" }) {
  const cls = { accent: "bg-accent-soft text-accent-ink", neutral: "bg-surface-2 text-ink-2", danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", quiet: "text-muted" }[tone];
  return (
    <span className={cn("rounded-full px-2 py-0.5 font-bold", cls)}>
      {label} <span className="tabular">{formatNumber(n)}</span>
    </span>
  );
}
