import Link from "next/link";
import type { Metadata } from "next";
import { MapPin, PackageCheck, Store, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Code, DateText, EmptyState, Money, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { CreateShipmentButton, ShipmentActions } from "@/components/panel/shipping-actions";
import { PRIORITY, SHIPMENT_STATUS } from "@/lib/labels";
import { formatNumber, formatPhone } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { deliveryOptions, openShipments, readyToShip, recentShipments } from "@/server/modules/delivery/queries";

export const metadata: Metadata = { title: "ارسال" };

const TABS = [
  { key: "ready", label: "آماده ارسال" },
  { key: "open", label: "مرسوله‌های باز" },
  { key: "done", label: "هفت روز اخیر" },
] as const;

export default async function ShippingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ workspace: "shipping", anyOf: ["delivery.view", "delivery.manage", "delivery.execute"] });
  const perms = [...ctx.actor.permissions];
  const canManage = ctx.actor.permissions.has("delivery.manage");
  const open = await openShipments(ctx);
  const ready = canManage || ctx.actor.permissions.has("delivery.view") ? await readyToShip(ctx) : [];
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? (canManage ? "ready" : "open");
  const done = tab === "done" ? await recentShipments(ctx) : [];
  const { methods, vehicles, couriers } = await deliveryOptions(ctx);
  const methodOptions = methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind }));
  const vehicleOptions = vehicles.map((v) => ({ id: v.id, name: v.plateNumber ? `${v.name} (${v.plateNumber})` : v.name }));
  const out = open.filter((s) => s.s.status === "OUT_FOR_DELIVERY");
  const pickups = open.filter((s) => s.methodKind === "PICKUP");
  const blocked = ready.filter((r) => r.order.balance > 0 && !r.order.paymentGateOverride);
  const counts: Record<string, number> = { ready: ready.length, open: open.length };

  const shipmentCard = (row: (typeof open)[number]) => {
    const { s } = row;
    const addr = s.address;
    return (
      <li key={s.id} className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/panel/orders/${s.orderId}`} className="hover:text-accent-ink"><OrderNo n={row.orderNumber} /></Link>
          <span className="font-bold">{row.customerName}</span>
          <span className="text-[12.5px] text-muted">• {row.methodName}</span>
          <Status map={SHIPMENT_STATUS} value={s.status} />
          <span className="ms-auto text-[12.5px] text-muted">{row.assigneeName ? `پیک: ${row.assigneeName}` : row.methodKind === "INTERNAL" ? "پیک تعیین نشده" : ""}{row.vehicleName ? ` • ${row.vehicleName}` : ""}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] text-ink-2">{row.lines.map((l) => `${l.title} × ${formatNumber(l.quantity)}`).join("، ")}</p>
        {addr && (
          <p className="mt-1 flex items-start gap-1.5 text-[12.5px] text-muted">
            <MapPin className="mt-1 size-3.5 shrink-0" />
            <span>{addr.city}، {addr.line} • {addr.recipientName} <Code>{formatPhone(addr.recipientPhone)}</Code></span>
          </p>
        )}
        {s.trackingCode && <p className="mt-1 text-[12.5px] text-muted">رهگیری: <Code>{s.trackingCode}</Code>{s.externalProvider && ` • ${s.externalProvider}`}</p>}
        {s.failureReason && <p className="mt-1 text-[12.5px] text-danger">{s.failureReason}</p>}
        {s.status === "DELIVERED" && <p className="mt-1 text-[12.5px] text-success">تحویل به {s.recipientName} • <DateText value={s.deliveredAt} withTime />{s.proofFileId && <> • <a className="font-bold text-accent-ink" target="_blank" rel="noreferrer" href={`/api/v1/files/${s.proofFileId}?inline=1`}>مدرک تحویل</a></>}</p>}
        <div className="mt-2.5"><ShipmentActions s={{ id: s.id, status: s.status, methodKind: row.methodKind, recipientName: s.recipientName, assigneeId: s.assigneeId }} perms={perms} couriers={couriers} /></div>
      </li>
    );
  };

  return (
    <>
      <PageHeader title="ارسال" description="سفارش‌های آماده، ایجاد و تخصیص مرسوله، خروج از چاپخانه و ثبت تحویل با مدرک" />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="آماده ارسال" value={formatNumber(ready.length)} sub={blocked.length ? `${formatNumber(blocked.length)} سفارش منتظر تسویه` : "همه تسویه شده‌اند"} tone={blocked.length ? "warning" : "neutral"} icon={<PackageCheck />} href="/panel/shipping?tab=ready" />
        <Stat label="در مسیر" value={formatNumber(out.length)} icon={<Truck />} tone={out.length ? "accent" : "neutral"} href="/panel/shipping?tab=open" />
        <Stat label="منتظر تحویل حضوری" value={formatNumber(pickups.length)} icon={<Store />} href="/panel/shipping?tab=open" />
        <Stat label="مرسوله باز" value={formatNumber(open.length)} sub={`${formatNumber(open.filter((s) => s.methodKind === "INTERNAL" && !s.s.assigneeId).length)} بدون پیک`} href="/panel/shipping?tab=open" />
      </div>
      <FilterTabs active={tab} tabs={TABS.filter((t) => t.key !== "ready" || ready.length || canManage).map((t) => ({ key: t.key, label: t.label, href: `/panel/shipping?tab=${t.key}`, count: counts[t.key] }))} />
      <Card className="overflow-hidden">
        {tab === "ready" && (
          ready.length === 0 ? <EmptyState icon={<PackageCheck />} title="سفارشی آماده ارسال نیست" /> : (
            <ul className="divide-y divide-line">
              {ready.map((r) => {
                const settled = r.order.balance <= 0 || r.order.paymentGateOverride;
                const method = methods.find((m) => m.id === r.order.deliveryMethodId);
                return (
                  <li key={r.order.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/panel/orders/${r.order.id}`} className="hover:text-accent-ink"><OrderNo n={r.order.number} /></Link>
                        <span className="font-bold">{r.customerName}</span>
                        <Code className="text-[12px] text-muted">{formatPhone(r.customerPhone)}</Code>
                        {r.order.priority !== "NORMAL" && <Status map={PRIORITY} value={r.order.priority} />}
                        {r.order.deliveryStatus === "PARTIALLY_DELIVERED" && <Badge tone="info">تحویل بخشی</Badge>}
                      </div>
                      <p className="mt-1 text-[12.5px] text-ink-2">{r.lines.map((l) => `${l.title} × ${formatNumber(l.remaining)}`).join("، ")}</p>
                      <p className="mt-1 text-[12.5px] text-muted">
                        {method?.name ?? "روش ارسال انتخاب نشده"}
                        {r.order.shippingAddress && ` • ${r.order.shippingAddress.city}`}
                        {r.order.readyAt && <> • آماده از <DateText value={r.order.readyAt} relative /></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {settled ? <Badge tone="success">تسویه</Badge> : <Badge tone="warning">مانده <Money rial={r.order.balance} unit={false} className="ms-1" /></Badge>}
                      {canManage && (settled ? (
                        <CreateShipmentButton size="xs" orderId={r.order.id} shippable={r.lines} methods={methodOptions} couriers={couriers} vehicles={vehicleOptions} defaultMethodId={r.order.deliveryMethodId} />
                      ) : (
                        <Link href={`/panel/orders/${r.order.id}`} className="text-[12.5px] font-bold text-accent-ink">پیگیری پرداخت</Link>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}
        {tab === "open" && (open.length === 0 ? <EmptyState icon={<Truck />} title="مرسوله بازی نیست" /> : <ul className="divide-y divide-line">{open.map(shipmentCard)}</ul>)}
        {tab === "done" && (done.length === 0 ? <EmptyState title="در هفت روز اخیر مرسوله‌ای بسته نشده است" /> : <ul className="divide-y divide-line">{done.map(shipmentCard)}</ul>)}
      </Card>
    </>
  );
}
