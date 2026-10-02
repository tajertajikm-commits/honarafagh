import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Download, ExternalLink, FileText, Phone } from "lucide-react";
import { and, eq, inArray } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CustomerCode, DateText, EmptyState, Money, OrderCode } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { ReasonAction } from "@/components/panel/actions";
import { PriorityFlag, TypeChip } from "@/components/panel/chips";
import { KV } from "@/components/panel/page";
import { StepActions } from "@/components/panel/step-actions";
import { ApprovalPanel, ArtworkReview, ArtworkUpload, ChooseSupplier, DesignComplete, DispatchForm, IssueInvoice, LithoForm, PaymentForm, PriceForm, PriorityControl, QuoteForm } from "@/components/panel/order-forms";
import { ActionButton } from "@/components/panel/actions";
import { employeeRoles, employees, rolePermissions, users } from "@/server/db/schema";
import { can, type Ctx } from "@/server/core/context";
import { requireStaffPage } from "@/server/http/session";
import { suggestedStations } from "@/server/modules/orders/approval";
import { staffOrder, type StaffOrder } from "@/server/modules/orders/queries";
import { balanceOf } from "@/server/modules/orders/state";
import { listMachines, listMaterials } from "@/server/modules/materials/service";
import { listSuppliers } from "@/server/modules/offset/service";
import { blockedReason } from "@/server/modules/workflow/engine";
import { APPROVE_PERMISSION, stationsOf } from "@/server/modules/workflow/stations";
import { customerStatus } from "@/lib/order-status";
import { APPROVAL_DECISION, ARTWORK_FILE_STATUS, ARTWORK_STATUS, INVOICE_TYPE, LITHO_STATUS, ORDER_KIND, ORDER_STATUS, PAYMENT_METHOD, PAYMENT_RECORD_STATUS, PAYMENT_STATUS, PRODUCTION_TYPE, SHIPPING_METHOD, STEP_STATUS, label } from "@/lib/labels";
import { cn } from "@/lib/cn";
import { formatNumber, formatPhone } from "@/lib/persian";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  return { title: `سفارش ${decodeURIComponent((await params).code)}` };
}

const TABS = [
  { key: "summary", label: "خلاصه و مشخصات" },
  { key: "files", label: "فایل و طراحی" },
  { key: "production", label: "تولید" },
  { key: "procurement", label: "کاغذ و لیتوگرافی", offsetOnly: true },
  { key: "finance", label: "مالی و فاکتور" },
  { key: "shipping", label: "ارسال" },
  { key: "history", label: "تاریخچه" },
] as const;
type Tab = (typeof TABS)[number]["key"];

async function staffWith(ctx: Ctx, permissions: string[]) {
  const rows = await ctx.db
    .selectDistinct({ id: employees.id, name: users.fullName })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .innerJoin(employeeRoles, eq(employeeRoles.employeeId, employees.id))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, employeeRoles.roleId))
    .where(and(eq(employees.isActive, true), inArray(rolePermissions.permission, permissions)));
  return rows;
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireStaffPage();
  const code = decodeURIComponent((await params).code);
  const data = await staffOrder(ctx, code);
  const { order: o, customer: c } = data;
  const sp = await searchParams;
  const tabs = TABS.filter((t) => !("offsetOnly" in t) || o.productionType === "OFFSET");
  const tab: Tab = (tabs.find((t) => t.key === sp.tab)?.key ?? "summary") as Tab;
  const canApprove = can(ctx, APPROVE_PERMISSION[o.productionType]) && (o.status === "WAITING_APPROVAL" || o.status === "NEEDS_INFO");
  const closed = ["DELIVERED", "REJECTED", "CANCELLED"].includes(o.status);
  const cs = customerStatus(o.status, o.artworkStatus);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <nav className="text-[12.5px] text-muted">
        <Link href="/panel/orders" className="hover:text-ink">سفارش‌ها</Link> <span className="mx-1">‹</span> <OrderCode code={o.code} className="font-medium" />
      </nav>

      {/* Header */}
      <header className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold"><OrderCode code={o.code} /></h1>
              <TypeChip type={o.productionType} />
              {o.isPriority && <PriorityFlag />}
              <Badge tone="neutral">{ORDER_KIND[o.kind]}</Badge>
            </div>
            <p className="mt-1 text-[16px] font-bold">{o.title}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
              {can(ctx, "customer.view") ? (
                <Link href={`/panel/customers/CUS-${c.code}`} className="font-bold text-ink hover:underline">{c.companyName || c.fullName}</Link>
              ) : (
                <span className="font-bold text-ink">{c.companyName || c.fullName}</span>
              )}
              <CustomerCode code={c.code} />
              <span className="inline-flex items-center gap-1"><Phone className="size-3.5" /><bdi dir="ltr">{formatPhone(c.phone)}</bdi></span>
              <span>ثبت: <DateText value={o.createdAt} withTime /></span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can(ctx, "order.priority") && !closed && <PriorityControl orderId={o.id} isPriority={o.isPriority} />}
            {can(ctx, "order.cancel") && !closed && (
              <ReasonAction path={`orders/${o.id}/cancel`} title="لغو سفارش" success="سفارش لغو شد." variant="danger-ghost" danger confirmLabel="لغو سفارش">
                لغو
              </ReasonAction>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <StateTile label="وضعیت سفارش"><Status map={ORDER_STATUS} value={o.status} /></StateTile>
          <StateTile label="فایل و طراحی"><Status map={ARTWORK_STATUS} value={o.artworkStatus} /></StateTile>
          <StateTile label="پرداخت">{o.pricedAt ? <Status map={PAYMENT_STATUS} value={o.paymentStatus} /> : <Badge tone="warning">مبلغ تعیین نشده</Badge>}</StateTile>
          <StateTile label="مشتری می‌بیند"><Badge tone={cs.tone === "warning" ? "warning" : cs.tone === "danger" ? "danger" : cs.tone === "success" ? "success" : "info"}>{cs.label}</Badge></StateTile>
        </div>
        {o.status === "NEEDS_INFO" && <p className="mt-3 rounded-xl bg-violet-soft px-4 py-2.5 text-[13px] text-violet">منتظر پاسخ مشتری؛ پس از پاسخ، سفارش دوباره به صف تأیید برمی‌گردد.</p>}
        {o.status === "REJECTED" && <p className="mt-3 rounded-xl bg-danger-soft px-4 py-2.5 text-[13px] text-danger">سفارش رد شده است: {data.approvals.at(-1)?.approval.reason}</p>}
      </header>

      {canApprove && <Approval ctx={ctx} data={data} />}

      {/* Tabs */}
      <div className="scrollbar-thin -mx-1 flex gap-1 overflow-x-auto px-1">
        {tabs.map((t) => (
          <Link key={t.key} href={`/panel/orders/${o.code}${t.key === "summary" ? "" : `?tab=${t.key}`}`} className={cn("flex h-9 shrink-0 items-center rounded-lg px-3.5 text-[13.5px] font-bold transition-colors", tab === t.key ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2")}>
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "summary" && <Summary data={data} />}
      {tab === "files" && <Files ctx={ctx} data={data} />}
      {tab === "production" && <Production ctx={ctx} data={data} />}
      {tab === "procurement" && <Procurement ctx={ctx} data={data} />}
      {tab === "finance" && <Finance ctx={ctx} data={data} />}
      {tab === "shipping" && <Shipping ctx={ctx} data={data} />}
      {tab === "history" && <History data={data} />}
    </div>
  );
}

function StateTile({ label: l, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2/70 px-3 py-2">
      <p className="mb-1 text-[11.5px] font-bold text-muted">{l}</p>
      {children}
    </div>
  );
}

async function Approval({ ctx, data }: { ctx: Ctx; data: StaffOrder }) {
  const o = data.order;
  const suggested = await suggestedStations(ctx, o);
  const designers = o.needsDesign ? await staffWith(ctx, ["design.work"]) : [];
  return (
    <ApprovalPanel
      orderId={o.id}
      typeLabel={PRODUCTION_TYPE[o.productionType]!}
      stations={stationsOf(o.productionType).map((s) => ({ key: s.key, name: s.name, hint: s.hint, phase: s.phase, required: s.required, kind: s.kind }))}
      suggested={suggested}
      canPrice={can(ctx, "order.price") && o.kind === "CUSTOM"}
      priced={!!o.pricedAt}
      needsDesign={o.needsDesign}
      designers={designers}
    />
  );
}

// ── Summary ─────────────────────────────────────────────────────────────────

function Summary({ data }: { data: StaffOrder }) {
  const o = data.order;
  const spec: [string, ReactNode][] = [
    ["نوع تولید", PRODUCTION_TYPE[o.productionType]],
    ["تیراژ", o.quantity ? formatNumber(o.quantity) : "—"],
    ["ابعاد", o.dimensions || "—"],
    ["جنس کاغذ / مقوا", o.material || "—"],
    ["رنگ", o.colors || "—"],
    ["عملیات تکمیلی", o.finishing || "—"],
    ["فایل", o.needsDesign ? "طراحی توسط چاپخانه" : "فایل آماده مشتری"],
    ["تحویل درخواستی", o.requestedDeadline ? <DateText key="d" value={o.requestedDeadline} /> : "—"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
      <div className="space-y-5">
        <Card>
          <CardHeader title="مشخصات سفارش" />
          <CardBody className="grid gap-x-8 sm:grid-cols-2">
            {spec.map(([k, v]) => (
              <KV key={k} label={k}>{v}</KV>
            ))}
          </CardBody>
          {(o.description || o.customerNote) && (
            <CardBody className="space-y-3 border-t border-line">
              {o.description && <p className="whitespace-pre-line text-[13.5px] leading-7">{o.description}</p>}
              {o.customerNote && <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13px]"><b>یادداشت مشتری: </b>{o.customerNote}</p>}
            </CardBody>
          )}
        </Card>
        {data.items.length > 0 && (
          <Card>
            <CardHeader title="اقلام" />
            <ul className="divide-y divide-line">
              {data.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13.5px]">
                  <span className="min-w-0 flex-1">
                    <b>{i.title}</b> <span className="text-muted">× {formatNumber(i.quantity)} {i.unitLabel}</span>
                    {i.priceSnapshot?.spec?.summary?.length ? <span className="block text-[12px] text-muted">{i.priceSnapshot.spec.summary.join(" • ")}</span> : i.description ? <span className="block text-[12px] text-muted">{i.description}</span> : null}
                  </span>
                  <Money rial={i.lineSubtotal} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <div className="space-y-5">
        <Card>
          <CardHeader title="مسیر تولید" description={data.steps.length ? "ایستگاه‌هایی که هنگام تأیید انتخاب شد" : undefined} />
          <CardBody>
            {data.steps.length === 0 ? (
              <p className="text-[13px] text-muted">پس از تأیید، مسیر تولید این سفارش این‌جا نمایش داده می‌شود.</p>
            ) : (
              <ol className="space-y-1.5">
                {data.steps.map((s) => (
                  <li key={s.step.id} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className={cn("flex items-center gap-2", s.step.status === "DONE" && "text-muted line-through decoration-line-strong")}>
                      <span className={cn("size-2 rounded-full", s.step.status === "DONE" ? "bg-success" : s.step.status === "IN_PROGRESS" ? "bg-accent pulse-dot" : s.step.status === "READY" ? "bg-warning" : "bg-line-strong")} />
                      {s.station.name}
                    </span>
                    <span className="text-[12px] text-muted">{label(STEP_STATUS, s.step.status)}</span>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="سابقه تأیید" />
          <CardBody className="space-y-3">
            {data.approvals.length === 0 && <p className="text-[13px] text-muted">هنوز تصمیمی ثبت نشده است.</p>}
            {data.approvals.map(({ approval: a, approverName }) => (
              <div key={a.id} className="rounded-xl border border-line px-3 py-2.5 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <Status map={APPROVAL_DECISION} value={a.decision} />
                  <DateText value={a.createdAt} withTime className="text-[12px] text-muted" />
                </div>
                <p className="mt-1.5 font-bold">{approverName}</p>
                {a.reason && <p className="text-danger">{a.reason}</p>}
                {a.notes && <p className="text-ink-2">{a.notes}</p>}
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ── Files ───────────────────────────────────────────────────────────────────

function Files({ ctx, data }: { ctx: Ctx; data: StaffOrder }) {
  const o = data.order;
  const open = !["REJECTED", "CANCELLED", "DELIVERED"].includes(o.status);
  const designing = o.needsDesign && ["DESIGN_REQUESTED", "DESIGN_IN_PROGRESS"].includes(o.artworkStatus);
  const canDesign = can(ctx, "design.work") && ["APPROVED", "IN_PRODUCTION"].includes(o.status);
  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader title="نسخه‌های فایل" description="هر بارگذاری یک نسخه جدید است؛ نسخه‌ها هرگز بازنویسی نمی‌شوند." />
        {data.artwork.length === 0 ? (
          <CardBody><EmptyState title={o.needsDesign ? "مشتری طراحی خواسته است" : "هنوز فایلی بارگذاری نشده"} description={o.needsDesign ? "فایل طراحی توسط مسئول طراحی بارگذاری می‌شود." : "مشتری می‌تواند از حساب کاربری فایل بفرستد."} /></CardBody>
        ) : (
          <ul className="divide-y divide-line">
            {[...data.artwork].reverse().map(({ artwork: a, file, uploaderName }) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="grid size-9 place-items-center rounded-lg bg-surface-2"><FileText className="size-4 text-muted" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold" dir="auto">نسخه {formatNumber(a.versionNo)} — {file.name}</p>
                  <p className="text-[12px] text-muted">{a.source === "CUSTOMER" ? "فایل مشتری" : "فایل طراحی"} • {uploaderName ?? "—"} • <DateText value={a.createdAt} withTime /></p>
                  {a.reviewNote && <p className={cn("mt-0.5 text-[12.5px]", a.status === "REJECTED" ? "text-danger" : "text-ink-2")}>{a.reviewNote}</p>}
                </div>
                <Status map={ARTWORK_FILE_STATUS} value={a.status} />
                <a href={`/api/v1/files/${file.id}`} className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-ink" aria-label="دانلود"><Download className="size-4" /></a>
                {a.status === "UPLOADED" && a.source === "CUSTOMER" && can(ctx, "artwork.review") && open && <ArtworkReview artworkId={a.id} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader title="وضعیت فایل" />
          <CardBody className="space-y-3">
            <Status map={ARTWORK_STATUS} value={o.artworkStatus} />
            {o.needsDesign && <KV label="طراح">{data.designerName ?? "تعیین نشده"}</KV>}
            {designing && canDesign && (
              <div className="space-y-3 rounded-xl bg-violet-soft/60 p-3">
                {o.artworkStatus === "DESIGN_REQUESTED" && <ActionButton path={`orders/${o.id}/design/start`} success="طراحی شروع شد." size="sm" variant="secondary">شروع طراحی</ActionButton>}
                <ArtworkUpload orderId={o.id} purpose="DESIGN" label="ثبت فایل طراحی" />
                {data.artwork.some((x) => x.artwork.source === "DESIGNER") && <DesignComplete orderId={o.id} />}
              </div>
            )}
            {!o.needsDesign && open && can(ctx, "artwork.review") && (
              <div>
                <p className="mb-2 text-[12.5px] text-muted">اگر مشتری فایل را حضوری یا با پیام‌رسان داده است:</p>
                <ArtworkUpload orderId={o.id} purpose="DESIGN" label="ثبت فایل" />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ── Production ──────────────────────────────────────────────────────────────

async function Production({ ctx, data }: { ctx: Ctx; data: StaffOrder }) {
  const o = data.order;
  if (data.steps.length === 0) return <Card><CardBody><EmptyState title="مسیر تولید هنوز تعیین نشده" description="پس از تأیید سفارش، ایستگاه‌های انتخاب‌شده این‌جا نمایش داده می‌شوند." /></CardBody></Card>;
  const materials = can(ctx, "digital.production") && o.productionType === "DIGITAL" ? (await listMaterials(ctx, { category: ["PAPER", "CARDBOARD"] })).map((m) => ({ id: m.id, name: m.name, unit: m.unit, stock: m.stock, category: m.category })) : [];
  const machines = can(ctx, "offset.press.assign") ? await listMachines(ctx) : [];
  const phases = [...new Set(data.steps.map((s) => s.step.phase))];
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title={`مسیر تولید ${PRODUCTION_TYPE[o.productionType]}`} description="هر مرحله وقتی مراحل قبلی تمام شد وارد صف ایستگاهش می‌شود." />
        <ol className="divide-y divide-line">
          {phases.map((p) => (
            <li key={p} className={cn("grid", data.steps.filter((s) => s.step.phase === p).length > 1 && "lg:grid-cols-2 lg:divide-x lg:divide-x-reverse lg:divide-line")}>
              {data.steps.filter((s) => s.step.phase === p).map(({ step: s, station: st, machineName, assigneeName }) => {
                const returnOptions = data.steps.filter((x) => x.step.phase < s.phase && ["WORK", "PRINT", "PAPER_SELECT"].includes(x.station.kind)).map((x) => ({ key: x.step.key, name: x.station.name }));
                return (
                  <div key={s.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-4", s.status === "IN_PROGRESS" && "bg-accent-soft/40", s.status === "READY" && "bg-warning-soft/30")}>
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-[12px] font-bold tabular", s.status === "DONE" ? "bg-success text-white" : s.status === "IN_PROGRESS" ? "bg-accent text-white" : s.status === "READY" ? "bg-warning-soft text-warning ring-1 ring-warning/30" : "bg-surface-2 text-muted")}>
                      {formatNumber(p)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-bold">{st.name} {s.reworkCount > 0 && <Badge tone="danger" className="ms-1">دوباره‌کاری × {formatNumber(s.reworkCount)}</Badge>}</p>
                      <p className="text-[12px] text-muted">
                        {label(STEP_STATUS, s.status)}
                        {assigneeName && ` • ${assigneeName}`}
                        {machineName && ` • ${machineName}`}
                        {s.completedAt && <> • <DateText value={s.completedAt} withTime /></>}
                        {s.status === "IN_PROGRESS" && s.startedAt && <> • از <DateText value={s.startedAt} relative /></>}
                      </p>
                      {typeof s.data.materialName === "string" && <p className="text-[12px] text-ink-2">کاغذ: {s.data.materialName}{s.data.quantity ? ` — ${formatNumber(Number(s.data.quantity))} برگ` : ""}</p>}
                      {typeof s.data.paperNote === "string" && <p className="text-[12px] text-ink-2">کاغذ: {s.data.paperNote}</p>}
                      {s.note && <p className="text-[12px] text-ink-2">{s.note}</p>}
                      {blockedReason(s, o) && <Badge tone="warning" className="mt-1">{blockedReason(s, o)}</Badge>}
                    </div>
                    <StepActions
                      step={{ id: s.id, key: s.key, name: st.name, kind: st.kind, status: s.status, machineId: s.machineId, blocked: blockedReason(s, o), orderCode: o.code }}
                      canPerform={can(ctx, st.permission)}
                      canAssignPress={can(ctx, "offset.press.assign")}
                      materials={materials}
                      machines={machines}
                      returnOptions={returnOptions}
                    />
                  </div>
                );
              })}
            </li>
          ))}
        </ol>
      </Card>
      {data.quality.length > 0 && (
        <Card>
          <CardHeader title="تأییدهای کیفیت" />
          <ul className="divide-y divide-line">
            {data.quality.map(({ q, approverName }) => (
              <li key={q.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                <Badge tone={q.decision === "APPROVED" ? "success" : "danger"}>{q.decision === "APPROVED" ? "تأیید" : "رد"}</Badge>
                <span className="font-bold">{data.steps.find((s) => s.step.id === q.stepId)?.station.name}</span>
                <span className="text-muted">{approverName}</span>
                {q.reason && <span className="text-danger">{q.reason}</span>}
                {q.notes && <span className="text-ink-2">{q.notes}</span>}
                <DateText value={q.createdAt} withTime className="ms-auto text-[12px] text-muted" />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ── Offset procurement ──────────────────────────────────────────────────────

async function Procurement({ ctx, data }: { ctx: Ctx; data: StaffOrder }) {
  const o = data.order;
  const paperStep = data.steps.find((s) => s.step.key === "O_PAPER")?.step;
  const lithoStep = data.steps.find((s) => s.step.key === "O_LITHO")?.step;
  const p = data.offset?.procurement;
  const litho = data.offset?.litho;
  const cheapest = p?.quotes[0]?.quote.price;
  const decided = p?.decision?.decision.quoteId;
  const paperOpen = paperStep && paperStep.status !== "DONE" && paperStep.status !== "WAITING";
  const paperSuppliers = can(ctx, "offset.paper") ? (await listSuppliers(ctx, "PAPER")).map((s) => ({ id: s.id, name: s.name })) : [];
  const lithoSuppliers = can(ctx, "offset.litho") ? (await listSuppliers(ctx, "LITHO")).map((s) => ({ id: s.id, name: s.name })) : [];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="تأمین کاغذ" description="استعلام تلفنی از چند تأمین‌کننده، انتخاب مدیر، سپس دریافت کاغذ." actions={paperStep ? <Status map={STEP_STATUS} value={paperStep.status} /> : undefined} />
        {!paperStep ? (
          <CardBody><p className="text-[13px] text-muted">تأمین کاغذ در مسیر این سفارش انتخاب نشده است.</p></CardBody>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {p?.quotes.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">هنوز قیمتی ثبت نشده است.</li>}
              {p?.quotes.map(({ quote: q, supplierName, supplierPhone }) => (
                <li key={q.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3", decided === q.id && "bg-success-soft/50")}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold">{supplierName} {q.price === cheapest && (p?.quotes.length ?? 0) > 1 && <Badge tone="success" className="ms-1">ارزان‌ترین</Badge>}</p>
                    <p className="text-[12px] text-muted">{supplierPhone && <bdi dir="ltr">{supplierPhone}</bdi>} • <DateText value={q.quotedAt} withTime />{q.notes ? ` • ${q.notes}` : ""}</p>
                  </div>
                  <Money rial={q.price} strong className="text-[15px]" />
                  {decided === q.id ? <Badge tone="success">انتخاب‌شده</Badge> : can(ctx, "offset.paper.approve") && paperOpen && <ChooseSupplier orderId={o.id} quoteId={q.id} label={supplierName} />}
                </li>
              ))}
            </ul>
            <CardBody className="space-y-3 border-t border-line">
              {p?.decision && (
                <p className="text-[13px]">تصمیم: <b>{p.decision.approverName}</b> — <DateText value={p.decision.decision.approvedAt} withTime />{p.decision.decision.notes ? ` — ${p.decision.decision.notes}` : ""}</p>
              )}
              {paperOpen && !p?.decision && can(ctx, "offset.paper") && <QuoteForm orderId={o.id} suppliers={paperSuppliers} />}
              {paperOpen && !p?.decision && !can(ctx, "offset.paper.approve") && (p?.quotes.length ?? 0) > 0 && <p className="text-[12.5px] text-muted">منتظر انتخاب تأمین‌کننده توسط مدیر.</p>}
              {paperOpen && p?.decision && can(ctx, "offset.paper") && <ActionButton path={`orders/${o.id}/paper-received`} success="دریافت کاغذ ثبت شد." size="sm">کاغذ رسید</ActionButton>}
              {paperStep.status === "DONE" && <p className="text-[13px] text-success">کاغذ دریافت شد — <DateText value={paperStep.completedAt} withTime /></p>}
            </CardBody>
          </>
        )}
      </Card>
      <Card>
        <CardHeader title="لیتوگرافی (برون‌سپاری)" description="فقط ثبت می‌شود: شرکت، تاریخ ارسال و تحویل، هزینه و وضعیت." actions={litho ? <Status map={LITHO_STATUS} value={litho.job.status} /> : undefined} />
        <CardBody className="space-y-4">
          {!lithoStep ? (
            <p className="text-[13px] text-muted">لیتوگرافی در مسیر این سفارش انتخاب نشده است.</p>
          ) : (
            <>
              {litho && (
                <div className="grid gap-x-6 sm:grid-cols-2">
                  <KV label="لیتوگرافی">{litho.supplierName ?? "—"}</KV>
                  <KV label="ارسال"><DateText value={litho.job.sentAt} /></KV>
                  <KV label="تحویل پیش‌بینی‌شده"><DateText value={litho.job.expectedAt} /></KV>
                  <KV label="دریافت"><DateText value={litho.job.receivedAt} /></KV>
                  <KV label="هزینه"><Money rial={litho.job.price} /></KV>
                  {litho.job.notes && <KV label="توضیح">{litho.job.notes}</KV>}
                </div>
              )}
              {lithoStep.status === "DONE" ? (
                <p className="text-[13px] text-success">زینک دریافت شد.</p>
              ) : lithoStep.status === "WAITING" ? null : can(ctx, "offset.litho") ? (
                blockedReason(lithoStep, o) ? (
                  <Badge tone="warning">{blockedReason(lithoStep, o)} — پس از آماده شدن فایل نهایی سفارش دهید</Badge>
                ) : (
                  <LithoForm orderId={o.id} suppliers={lithoSuppliers} job={litho ? { supplierId: litho.job.supplierId, status: litho.job.status, expectedAt: litho.job.expectedAt?.toISOString() ?? null, price: litho.job.price, notes: litho.job.notes } : null} />
                )
              ) : null}
            </>
          )}
        </CardBody>
      </Card>
      {data.steps.find((s) => s.step.key === "O_PRINT") && (
        <Card className="lg:col-span-2">
          <CardHeader title="چاپ" />
          <CardBody>
            {(() => {
              const pr = data.steps.find((s) => s.step.key === "O_PRINT")!;
              return (
                <p className="text-[13.5px]">
                  ماشین: <b>{pr.machineName ?? "تعیین نشده"}</b> • وضعیت: {label(STEP_STATUS, pr.step.status)}
                  {pr.step.status === "WAITING" && " — پس از لیتوگرافی و دریافت کاغذ وارد صف چاپ می‌شود."}
                </p>
              );
            })()}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ── Finance ─────────────────────────────────────────────────────────────────

function Finance({ ctx, data }: { ctx: Ctx; data: StaffOrder }) {
  const o = data.order;
  const c = data.customer;
  const balance = balanceOf(o);
  const open = !["REJECTED", "CANCELLED"].includes(o.status);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
      <Card>
        <CardHeader title="مبلغ سفارش" actions={o.pricedAt ? <Status map={PAYMENT_STATUS} value={o.paymentStatus} /> : <Badge tone="warning">تعیین نشده</Badge>} />
        <CardBody>
          <KV label="جمع اقلام"><Money rial={o.subtotal} /></KV>
          {o.discountAmount > 0 && <KV label="تخفیف"><Money rial={-o.discountAmount} /></KV>}
          {o.shippingAmount > 0 && <KV label="ارسال"><Money rial={o.shippingAmount} /></KV>}
          <KV label={`مالیات (${formatNumber(o.vatPct)}٪)`}><Money rial={o.vatAmount} /></KV>
          <KV label="جمع کل" className="border-t border-line pt-2 font-bold"><Money rial={o.total} strong /></KV>
          <KV label="پرداخت‌شده"><Money rial={o.paidAmount - o.refundedAmount} className="text-success" /></KV>
          <KV label="مانده"><Money rial={Math.max(0, balance)} strong className={balance > 0 ? "text-danger" : ""} /></KV>
        </CardBody>
        {can(ctx, "order.price") && open && (
          <CardBody className="border-t border-line">
            <PriceForm orderId={o.id} kind={o.kind} amount={o.kind === "CUSTOM" ? (data.items.find((i) => i.lineNo === 1 && !i.productId)?.lineSubtotal ?? null) : null} discount={o.discountAmount} />
          </CardBody>
        )}
      </Card>
      <div className="space-y-5">
        <Card>
          <CardHeader title="پرداخت‌ها" actions={can(ctx, "payment.record") && o.pricedAt && balance > 0 && open ? <PaymentForm orderId={o.id} balance={balance} /> : undefined} />
          <ul className="divide-y divide-line">
            {data.payments.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">پرداختی ثبت نشده است.</li>}
            {data.payments.map(({ payment: p, byName }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                <span className="font-bold">{p.kind === "REFUND" ? "بازپرداخت" : PAYMENT_METHOD[p.method]}</span>
                <Money rial={p.kind === "REFUND" ? -p.amount : p.amount} strong />
                <Status map={PAYMENT_RECORD_STATUS} value={p.status} />
                <span className="text-muted">{byName ?? (p.method === "ONLINE" ? "درگاه" : "")}{p.reference ? ` • ${p.reference}` : ""}</span>
                <DateText value={p.createdAt} withTime className="ms-auto text-[12px] text-muted" />
                {p.status === "AWAITING_APPROVAL" && can(ctx, "payment.record") && <ActionButton path={`payments/${p.id}/approve`} success="پرداخت تأیید شد." size="xs">تأیید</ActionButton>}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="فاکتورها" description={c.type === "COMPANY" ? "مشتری حقوقی — فاکتور رسمی" : "مشتری حقیقی — فاکتور غیررسمی"} actions={can(ctx, "invoice.manage") && o.pricedAt && open ? <IssueInvoice orderId={o.id} defaultType={c.type === "COMPANY" ? "OFFICIAL" : "UNOFFICIAL"} /> : undefined} />
          <ul className="divide-y divide-line">
            {data.invoices.length === 0 && <li className="px-5 py-4 text-[13px] text-muted">فاکتوری صادر نشده است.</li>}
            {data.invoices.map((i) => (
              <li key={i.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]", i.status === "VOID" && "opacity-60")}>
                <b className="tabular">فاکتور {formatNumber(i.number)}</b>
                <span className="text-muted">{INVOICE_TYPE[i.type]}</span>
                <Money rial={i.total} />
                {i.status === "VOID" && <Badge tone="neutral">باطل</Badge>}
                <DateText value={i.issuedAt} className="text-[12px] text-muted" />
                <Link href={`/panel/invoices/${i.id}`} className="ms-auto inline-flex items-center gap-1 font-bold text-accent-ink hover:underline">مشاهده و PDF <ExternalLink className="size-3.5" /></Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

// ── Shipping ────────────────────────────────────────────────────────────────

async function Shipping({ ctx, data }: { ctx: Ctx; data: StaffOrder }) {
  const o = data.order;
  const step = data.steps.find((s) => s.station.kind === "SHIPPING");
  const s = data.shipment;
  const canShip = step ? can(ctx, step.station.permission) : false;
  const people = canShip ? await staffWith(ctx, [o.productionType === "DIGITAL" ? "digital.dispatch" : "offset.shipping"]) : [];
  const preferred = o.deliveryMethodId ? null : null;
  return (
    <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Card>
        <CardHeader title="ارسال" actions={step ? <Status map={STEP_STATUS} value={step.step.status} /> : undefined} />
        <CardBody className="space-y-4">
          {s ? (
            <div className="grid gap-x-6 sm:grid-cols-2">
              <KV label="روش">{SHIPPING_METHOD[s.shipment.method]}</KV>
              <KV label="مسئول">{s.responsibleName ?? "—"}</KV>
              {s.shipment.carrierName && <KV label="حمل‌کننده">{s.shipment.carrierName}</KV>}
              {s.shipment.trackingCode && <KV label="کد رهگیری"><bdi dir="ltr">{s.shipment.trackingCode}</bdi></KV>}
              <KV label="ارسال"><DateText value={s.shipment.dispatchedAt} withTime /></KV>
              <KV label="تحویل">{s.shipment.deliveredAt ? <DateText value={s.shipment.deliveredAt} withTime /> : <Badge tone="info">در مسیر</Badge>}</KV>
              {s.shipment.recipientName && <KV label="گیرنده">{s.shipment.recipientName}</KV>}
              {s.shipment.notes && <KV label="توضیح">{s.shipment.notes}</KV>}
            </div>
          ) : step?.step.status === "READY" && canShip ? (
            <DispatchForm orderId={o.id} preferred={preferred} people={people} />
          ) : (
            <p className="text-[13px] text-muted">{step ? "سفارش پس از بسته‌بندی آماده ارسال می‌شود." : "مسیر تولید هنوز تعیین نشده است."}</p>
          )}
          {s && s.shipment.status === "DISPATCHED" && canShip && <ActionButton path={`orders/${o.id}/delivered`} success="تحویل ثبت شد." size="sm">تحویل شد</ActionButton>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="درخواست مشتری" />
        <CardBody>
          {o.shippingAddress ? (
            <p className="text-[13.5px] leading-7">{o.shippingAddress.city}، {o.shippingAddress.line}<br />{o.shippingAddress.recipientName} • <bdi dir="ltr">{formatPhone(o.shippingAddress.recipientPhone)}</bdi></p>
          ) : (
            <p className="text-[13px] text-muted">آدرسی ثبت نشده؛ روش ارسال هنگام آماده شدن هماهنگ می‌شود.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

function History({ data }: { data: StaffOrder }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
      <Card>
        <CardHeader title="تاریخچه کامل" description="رویدادهایی که برای مشتری هم نمایش داده می‌شوند علامت دارند." />
        <ol className="divide-y divide-line">
          {data.events.map((e) => (
            <li key={e.id} className="flex items-start gap-3 px-5 py-3 text-[13px]">
              <span className={cn("mt-2 size-2 shrink-0 rounded-full", e.visibleToCustomer ? "bg-info" : "bg-line-strong")} />
              <div className="min-w-0 flex-1">
                <p>{e.message}</p>
                <p className="text-[11.5px] text-muted">{e.actorLabel ?? "سیستم"} • <DateText value={e.createdAt} withTime />{e.visibleToCustomer && " • نمایش به مشتری"}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <Card>
        <CardHeader title="تغییرات اولویت" />
        <CardBody className="space-y-2">
          {data.priority.length === 0 && <p className="text-[13px] text-muted">اولویت این سفارش تغییر نکرده است.</p>}
          {data.priority.map(({ change: p, byName }) => (
            <div key={p.id} className="rounded-xl border border-line px-3 py-2 text-[13px]">
              <p className="font-bold">{p.isPriority ? "اولویت داده شد" : "اولویت برداشته شد"} — {byName}</p>
              <p className="text-ink-2">{p.reason}</p>
              <p className="text-[11.5px] text-muted"><DateText value={p.createdAt} withTime />{p.charge ? <> • هزینه <Money rial={p.charge} /></> : null}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}


