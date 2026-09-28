import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { AlertOctagon, Boxes, CreditCard, Factory, FileImage, History, MessageSquare, Package, Truck, UserRound } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Code, DateText, Money, OrderNo } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Status } from "@/components/ui/status";
import { KV, PageHeader } from "@/components/panel/page";
import { OrderHeaderActions } from "@/components/panel/order/header-actions";
import { ProductionPanel, type JobView } from "@/components/panel/order/production-panel";
import { ArtworkPanel } from "@/components/panel/order/artwork-panel";
import { MaterialsPanel } from "@/components/panel/order/materials-panel";
import { PaymentsPanel } from "@/components/panel/order/payments-panel";
import { DeliveryPanel } from "@/components/panel/order/delivery-panel";
import { PriceOverride, ResolveChange } from "@/components/panel/order/misc-panels";
import { ResolveIssueButton } from "@/components/panel/order/resolve-issue";
import { OrderTimeline } from "@/components/store/timeline";
import { cn } from "@/lib/cn";
import { DELIVERY_STATUS, FILE_STATUS, ISSUE_TYPE, METHOD, ORDER_STATUS, PAYMENT_STATUS, PRIORITY, PROCUREMENT_STATUS, PRODUCTION_STATUS, QC_STATUS, stateChange, URGENCY } from "@/lib/labels";
import { formatNumber, formatPercent, formatPhone, toFaDigits } from "@/lib/persian";
import { deliveryMethods, employees, machines, users, vehicles } from "@/server/db/schema";
import { isAppError } from "@/server/core/errors";
import { requireStaffPage } from "@/server/http/session";
import { shippableQuantities } from "@/server/modules/delivery/service";
import { getStaffOrder } from "@/server/modules/orders/queries";
import type { PriceBreakdown } from "@/server/modules/pricing/types";

export const metadata: Metadata = { title: "جزئیات سفارش" };

export default async function StaffOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStaffPage({ permission: "order.view" });
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let d: Awaited<ReturnType<typeof getStaffOrder>>;
  try {
    d = await getStaffOrder(ctx, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  const o = d.order;
  const perms = [...ctx.actor.permissions];
  const can = (p: string) => ctx.actor.permissions.has(p as never);
  const staff = await ctx.db.select({ id: employees.id, name: users.fullName }).from(employees).innerJoin(users, eq(users.id, employees.userId)).where(eq(employees.isActive, true)).orderBy(asc(users.fullName));
  const ms = await ctx.db.select({ id: machines.id, name: machines.name, typeCode: machines.typeCode }).from(machines).where(eq(machines.isActive, true));
  const methods = await ctx.db.select().from(deliveryMethods).where(eq(deliveryMethods.isActive, true)).orderBy(asc(deliveryMethods.sortOrder));
  const vs = await ctx.db.select().from(vehicles).where(eq(vehicles.isActive, true));
  const shippable = await shippableQuantities(ctx, id);
  const empName = new Map(staff.map((s) => [s.id, s.name]));
  const machineName = new Map(ms.map((m) => [m.id, m.name]));
  const balance = o.total - (o.paidAmount - o.refundedAmount);
  const itemTitle = new Map(d.items.map((i) => [i.id, i.title]));

  const jobs: JobView[] = d.jobs.map((j) => ({
    id: j.id,
    number: j.number,
    method: j.methodCode,
    itemTitle: itemTitle.get(j.orderItemId) ?? "",
    priority: j.priority,
    status: j.status,
    tasks: d.tasks
      .filter((t) => t.jobId === j.id)
      .map((t) => ({
        id: t.id,
        jobId: t.jobId,
        stepKey: t.stepKey,
        name: t.name,
        attempt: t.attempt,
        status: t.status,
        isGate: !!t.gate,
        gateKind: t.gate?.kind ?? null,
        isQc: t.isQc,
        machineTypeCode: t.machineTypeCode,
        machineId: t.machineId,
        machineName: t.machineId ? (machineName.get(t.machineId) ?? null) : null,
        assigneeId: t.assigneeId,
        assigneeName: t.assigneeId ? (empName.get(t.assigneeId) ?? null) : null,
        estimatedMinutes: t.estimatedMinutes,
        actualMinutes: t.actualMinutes,
        quantityPlanned: t.quantityPlanned,
        quantityCompleted: t.quantityCompleted,
        earliestStartAt: t.earliestStartAt?.toISOString() ?? null,
        completedAt: t.completedAt?.toISOString() ?? null,
        blockedReason: t.blockedReason,
        reworkReason: t.reworkReason,
        dependsOn: t.dependsOn,
      })),
  }));

  const DOMAINS: [string, string, Parameters<typeof Status>[0]["map"]][] = [
    ["سفارش", o.status, ORDER_STATUS],
    ["پرداخت", o.paymentStatus, PAYMENT_STATUS],
    ["فایل", o.fileStatus, FILE_STATUS],
    ["تأمین مواد", o.procurementStatus, PROCUREMENT_STATUS],
    ["تولید", o.productionStatus, PRODUCTION_STATUS],
    ["کنترل کیفیت", o.qcStatus, QC_STATUS],
    ["ارسال", o.deliveryStatus, DELIVERY_STATUS],
  ];
  const openIssues = d.issues.filter((i) => i.status === "OPEN");

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/panel/orders", label: "سفارش‌ها" }]}
        title={<span className="flex flex-wrap items-center gap-3">سفارش <OrderNo n={o.number} />{o.priority !== "NORMAL" && <Status map={PRIORITY} value={o.priority} />}{o.urgency !== "STANDARD" && <Badge tone="warning">{URGENCY[o.urgency]}</Badge>}</span>}
        description={<>ثبت <DateText value={o.placedAt} withTime /> · منبع: {({ WEBSITE: "وب‌سایت", SALES: "فروش", QUOTE: "پیش‌فاکتور", PHONE: "تلفنی", API: "API" } as Record<string, string>)[o.source]}{o.dueDate && <> · موعد تحویل: <b className="text-ink"><DateText value={o.dueDate} /></b></>}{o.projectedCompletionAt && <> · برآورد اتمام: <DateText value={o.projectedCompletionAt} withTime /></>}</>}
        actions={<OrderHeaderActions order={{ id: o.id, status: o.status, priority: o.priority, discountAmount: o.discountAmount, depositPct: o.depositPct, paymentGateOverride: o.paymentGateOverride }} perms={perms} />}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {DOMAINS.map(([label, value, map]) => (
          <div key={label} className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-soft">
            <p className="text-[11.5px] font-bold text-muted">{label}</p>
            <Status map={map} value={value} className="mt-1.5" />
          </div>
        ))}
      </div>

      {openIssues.length > 0 && (
        <div className="mt-4 space-y-2">
          {openIssues.map((i) => (
            <div key={i.id} className="flex items-center gap-3 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-[13.5px]">
              <AlertOctagon className="size-5 shrink-0 text-danger" />
              <span className="flex-1"><b>{ISSUE_TYPE[i.type]}:</b> {i.description}</span>
              {can("production.assign") && <ResolveIssueButton id={i.id} />}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid items-start gap-5 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="اقلام و قیمت" icon={<Package />} />
            <CardBody className="space-y-3 pt-0">
              {d.items.map((it) => {
                const snap = it.priceSnapshot as PriceBreakdown | null;
                const margin = it.lineSubtotal > 0 ? ((it.lineSubtotal - it.costTotal) / it.lineSubtotal) * 100 : 0;
                return (
                  <div key={it.id} className={cn("rounded-xl border border-line p-4", it.status === "CANCELLED" && "opacity-50")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[14.5px] font-bold">{it.title} <span className="font-medium text-muted">× {formatNumber(it.quantity)} {it.unitLabel}</span></p>
                        <p className="mt-0.5 text-[12.5px] text-muted">
                          {it.productionMethod && <>چاپ {METHOD[it.productionMethod]} · </>}{it.workflowTemplateCode && <Code>{it.workflowTemplateCode}</Code>}{snap && <> · آماده‌سازی {toFaDigits(snap.leadDays)} روز</>}
                          {it.isPriceOverridden && <Badge tone="warning" className="ms-2">قیمت دستی</Badge>}
                        </p>
                      </div>
                      <div className="text-end">
                        <Money rial={it.lineSubtotal} strong />
                        {d.canSeeCosts && <p className="text-[11.5px] text-muted">بهای تمام‌شده <Money rial={it.costTotal} unit={false} /> · حاشیه {formatPercent(margin)}</p>}
                      </div>
                    </div>
                    {snap && <p className="mt-2 text-[12.5px] leading-6 text-ink-2">{snap.spec.summary.map((s) => `${s.group}: ${toFaDigits(s.value)}`).join(" · ")}</p>}
                    {snap && d.canSeeCosts && (
                      <details className="mt-2 text-[12px]">
                        <summary className="cursor-pointer font-bold text-muted">جزئیات محاسبه و چیدمان فرم</summary>
                        <div className="mt-2 grid gap-3 lg:grid-cols-2">
                          <ul className="space-y-1">
                            {snap.lines.map((l, i) => <li key={i} className="flex justify-between gap-2"><span className="text-ink-2">{l.label}{l.component ? ` (${l.component})` : ""}</span><Money rial={l.amount} unit={false} /></li>)}
                            <li className="flex justify-between border-t border-line pt-1 font-bold"><span>بهای تمام‌شده</span><Money rial={snap.costTotal} unit={false} /></li>
                            <li className="flex justify-between"><span>سود ({formatPercent(snap.markupPct, 0)})</span><Money rial={snap.markupAmount} unit={false} /></li>
                          </ul>
                          <ul className="space-y-1">
                            {snap.impositions.map((im) => (
                              <li key={im.component} className="rounded-lg bg-surface-2/60 px-3 py-2">
                                <b>{im.name}</b>: {toFaDigits(im.ups)} عدد در برگ · {toFaDigits(im.forms)} فرم · {formatNumber(im.runSheets)} برگ چاپ + {formatNumber(im.wasteSheets)} ضایعات · {formatNumber(im.stockSheets)} برگ کاغذ{im.plates ? ` · ${toFaDigits(im.plates)} زینک` : ""}
                              </li>
                            ))}
                            <li className="text-muted">نسخه قیمت‌گذاری: <Code>{snap.ruleVersionId.slice(0, 8)}</Code></li>
                          </ul>
                        </div>
                      </details>
                    )}
                    {can("order.price.override") && !["COMPLETED", "CANCELLED"].includes(o.status) && <div className="mt-2 text-end"><PriceOverride itemId={it.id} current={it.lineSubtotal} /></div>}
                  </div>
                );
              })}
              <div className="grid gap-x-8 sm:grid-cols-2">
                <KV label="جمع اقلام"><Money rial={o.subtotal} /></KV>
                {o.discountAmount > 0 && <KV label="تخفیف"><Money rial={o.discountAmount} /></KV>}
                <KV label="ارسال"><Money rial={o.shippingAmount} /></KV>
                <KV label={`مالیات (${toFaDigits(o.vatPct)}٪)`}><Money rial={o.vatAmount} /></KV>
                <KV label="جمع کل"><Money rial={o.total} strong /></KV>
                {d.canSeeCosts && <KV label="بهای تمام‌شده برآوردی"><Money rial={o.costTotal} /></KV>}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="تولید" description="گردش‌کار تولید هر قلم؛ مراحل خودکار با برقراری شرط تکمیل می‌شوند." icon={<Factory />} />
            <CardBody className="pt-0">
              <ProductionPanel jobs={jobs} perms={perms} employees={staff} machines={ms} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="فایل‌ها و نسخه‌ها" icon={<FileImage />} />
            <CardBody className="pt-0">
              <ArtworkPanel
                perms={perms}
                items={d.items.map((i) => ({ id: i.id, title: i.title, fileStatus: i.fileStatus, needsDesign: i.needsDesign }))}
                versions={d.artwork.map((a) => ({ id: a.version.id, itemId: a.version.orderItemId, versionNo: a.version.versionNo, stage: a.version.stage, status: a.version.status, note: a.version.note, reviewNote: a.version.reviewNote, customerComment: a.version.customerComment, createdAt: a.version.createdAt.toISOString(), uploader: a.uploader, file: a.file }))}
              />
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="مواد" icon={<Boxes />} />
            <MaterialsPanel perms={perms} reqs={d.requirements.map((r) => ({ id: r.req.id, material: r.material, purpose: r.req.purpose, component: r.req.component, status: r.req.status, required: r.req.quantityRequired, reserved: r.req.quantityReserved, issued: r.req.quantityIssued, consumed: r.req.quantityConsumed, wasted: r.req.quantityWasted, returned: r.req.quantityReturned }))} />
          </Card>

          <div className="grid items-start gap-5 2xl:grid-cols-2">
            <Card>
              <CardHeader title="پرداخت‌ها" description={<>پرداخت‌شده <Money rial={o.paidAmount - o.refundedAmount} /> · مانده <Money rial={balance} className={balance > 0 ? "text-danger" : ""} /> · پیش‌پرداخت {toFaDigits(o.depositPct)}٪{o.paymentGateOverride && " (شرط برداشته شده)"}</>} icon={<CreditCard />} />
              <CardBody className="pt-0">
                <PaymentsPanel orderId={o.id} balance={balance} paid={o.paidAmount - o.refundedAmount} perms={perms} payments={d.payments.filter((p) => p.status !== "PENDING").map((p) => ({ id: p.id, number: p.number, kind: p.kind, method: p.method, status: p.status, amount: p.amount, reference: p.method === "ONLINE" ? p.providerRefId : p.reference, note: p.note, receiptFileId: p.receiptFileId, createdAt: p.createdAt.toISOString(), rejectionReason: p.rejectionReason }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="ارسال" icon={<Truck />} />
              <CardBody className="pt-0">
                <DeliveryPanel
                  orderId={o.id}
                  perms={perms}
                  defaultMethodId={o.deliveryMethodId}
                  methods={methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind }))}
                  couriers={staff}
                  vehicles={vs.map((v) => ({ id: v.id, name: `${v.name} (${v.plateNumber ?? ""})` }))}
                  shippable={shippable.map((s) => ({ itemId: s.item.id, title: s.item.title, remaining: s.item.productionStatus === "COMPLETED" ? s.remaining : Math.min(s.remaining, s.item.quantityProduced) }))}
                  shipments={d.shipments.map((s) => ({
                    id: s.id,
                    number: s.number,
                    status: s.status,
                    methodName: methods.find((m) => m.id === s.methodId)?.name ?? "",
                    methodKind: methods.find((m) => m.id === s.methodId)?.kind ?? "",
                    assigneeName: s.assigneeId ? (empName.get(s.assigneeId) ?? null) : null,
                    vehicleName: vs.find((v) => v.id === s.vehicleId)?.name ?? null,
                    trackingCode: s.trackingCode,
                    externalProvider: s.externalProvider,
                    recipientName: s.recipientName,
                    deliveredAt: s.deliveredAt?.toISOString() ?? null,
                    failureReason: s.failureReason,
                    proofFileId: s.proofFileId,
                    lines: d.shipmentItems.filter((l) => l.shipmentId === s.id).map((l) => ({ title: itemTitle.get(l.orderItemId) ?? "", quantity: l.quantity })),
                  }))}
                />
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="رویدادها" description="همه تغییرات سفارش در همه حوزه‌ها" icon={<History />} />
            <CardBody className="pt-0">
              <ul className="scrollbar-thin max-h-[420px] space-y-2.5 overflow-y-auto">
                {d.events.map(({ event: e, actorName }) => (
                  <li key={e.id} className="flex gap-3 text-[12.5px]">
                    <span className="mt-1.5 w-20 shrink-0 text-muted"><DateText value={e.createdAt} relative /></span>
                    <span className="flex-1">
                      <Badge className="me-1.5">{({ ORDER: "سفارش", PAYMENT: "پرداخت", FILE: "فایل", PROCUREMENT: "مواد", PRODUCTION: "تولید", QC: "کیفیت", DELIVERY: "ارسال" } as Record<string, string>)[e.domain] ?? e.domain}</Badge>
                      {e.message ?? (e.fromState || e.toState ? stateChange(e.domain, e.fromState, e.toState) : e.type)}
                      <span className="text-muted"> · {actorName ?? "سیستم"}</span>
                      {e.visibleToCustomer && <span className="text-[11px] text-info"> · قابل مشاهده برای مشتری</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-20">
          <Card>
            <CardHeader title="مشتری" icon={<UserRound />} actions={<Link href={`/panel/customers/${d.customer.id}`} className="text-[12.5px] font-bold text-accent-ink">پرونده</Link>} />
            <CardBody className="pt-0">
              <p className="text-[14px] font-bold">{d.customer.fullName}</p>
              {d.customer.companyName && <p className="text-[12.5px] text-muted">{d.customer.companyName}</p>}
              <p className="mt-1 text-[13px]"><bdi dir="ltr" className="tabular">{formatPhone(d.customer.phone)}</bdi></p>
              {o.shippingAddress && <p className="mt-3 text-[12.5px] leading-6 text-muted">{d.deliveryMethod?.name}<br />{o.shippingAddress.city}، {o.shippingAddress.line}<br />{o.shippingAddress.recipientName} · <bdi dir="ltr">{o.shippingAddress.recipientPhone}</bdi></p>}
              {!o.shippingAddress && d.deliveryMethod && <p className="mt-3 text-[12.5px] text-muted">{d.deliveryMethod.name}</p>}
              {o.customerNote && <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-[12.5px] text-ink-2">یادداشت مشتری: {o.customerNote}</p>}
              {o.internalNote && <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">{o.internalNote}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="نمای مشتری" description="همان چیزی که مشتری در پیگیری می‌بیند" />
            <CardBody className="pt-0"><OrderTimeline steps={d.timeline} /></CardBody>
          </Card>
          {d.changeRequests.length > 0 && (
            <Card>
              <CardHeader title="درخواست‌های تغییر" icon={<MessageSquare />} />
              <CardBody className="space-y-3 pt-0">
                {d.changeRequests.map((c) => (
                  <div key={c.id} className="rounded-xl border border-line p-3 text-[12.5px]">
                    <p>{c.description}</p>
                    <p className="mt-1 text-muted"><DateText value={c.createdAt} relative /> · {c.status === "PENDING" ? "در انتظار" : c.status === "APPROVED" ? "پذیرفته" : "رد شده"}{c.resolution ? ` — ${c.resolution}` : ""}</p>
                    {c.status === "PENDING" && can("order.edit") && <ResolveChange id={c.id} />}
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
