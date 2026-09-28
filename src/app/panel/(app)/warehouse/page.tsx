import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowDownToLine, Boxes, PackageCheck, PackageOpen, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Code, DateText, EmptyState, Num, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { IssueButton, MaterialRequestButton, ReceivePoButton, ReceiveStockButton, ReserveButton, ReturnButton } from "@/components/panel/inventory-actions";
import { INV_TX, PO_STATUS, PRIORITY, REQUIREMENT_STATUS, TASK_STATUS, UNIT } from "@/lib/labels";
import { formatNumber, toFaDigits } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { issuedOutstanding, listCategoriesAndLocations, listPurchaseOrders, listStock, openRequirements, recentTransactions } from "@/server/modules/inventory/queries";

export const metadata: Metadata = { title: "انبار" };

const TABS = [
  { key: "issue", label: "آماده حواله" },
  { key: "reserve", label: "رزرو و کمبود" },
  { key: "receive", label: "رسید کالا" },
  { key: "return", label: "برگشت از تولید" },
  { key: "ledger", label: "آخرین تراکنش‌ها" },
] as const;

export default async function WarehousePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ workspace: "warehouse", permission: "inventory.view" });
  const perms = ctx.actor.permissions;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "issue";

  const reqs = await openRequirements(ctx);
  const isHot = (r: (typeof reqs)[number]) => r.stepStatus === "READY" || r.stepStatus === "IN_PROGRESS";
  // Steps already waiting on material first, then by order due date.
  const toIssue = reqs.filter((r) => ["RESERVED", "PARTIALLY_ISSUED"].includes(r.req.status)).sort((a, b) => Number(isHot(b)) - Number(isHot(a)));
  const toReserve = reqs.filter((r) => ["PENDING", "SHORTAGE", "PARTIALLY_RESERVED"].includes(r.req.status));
  const incoming = await listPurchaseOrders(ctx, { status: ["ORDERED", "PARTIALLY_RECEIVED"] });
  const outstanding = await issuedOutstanding(ctx);
  const stock = await listStock(ctx);
  const low = stock.filter((s) => s.low);
  const { locations } = await listCategoriesAndLocations(ctx);
  const ledger = tab === "ledger" ? await recentTransactions(ctx, 60) : [];
  const materialOptions = stock.map((s) => ({ id: s.id, sku: s.sku, name: s.name, unit: s.unit }));
  const stepReady = toIssue.filter(isHot).length;
  const counts: Record<string, number> = { issue: toIssue.length, reserve: toReserve.length, receive: incoming.length, return: outstanding.length };

  return (
    <>
      <PageHeader
        title="انبار"
        description="حواله مواد به تولید به ترتیب موعد سفارش، رزرو، رسید کالا و برگشت مواد مصرف‌نشده"
        actions={
          <>
            {perms.has("procurement.manage") && <MaterialRequestButton materials={materialOptions} />}
            {perms.has("inventory.receive") && <ReceiveStockButton materials={materialOptions} locations={locations} variant="secondary" />}
            <Button asChild size="sm" variant="secondary"><Link href="/panel/inventory"><Boxes /> موجودی کالا</Link></Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="آماده حواله" value={formatNumber(toIssue.length)} sub={stepReady ? `${formatNumber(stepReady)} مورد، مرحله تولیدش آماده است` : "مرحله‌ای منتظر مواد نیست"} tone={stepReady ? "accent" : "neutral"} icon={<PackageOpen />} href="/panel/warehouse?tab=issue" />
        <Stat label="کمبود مواد" value={formatNumber(toReserve.filter((r) => r.req.status !== "PENDING").length)} sub="نیاز سفارش بدون موجودی کافی" tone={toReserve.some((r) => r.req.status !== "PENDING") ? "danger" : "neutral"} icon={<AlertTriangle />} href="/panel/warehouse?tab=reserve" />
        <Stat label="سفارش خرید در راه" value={formatNumber(incoming.length)} sub={incoming.some((p) => p.po.expectedAt && p.po.expectedAt < new Date()) ? "برخی از موعد رسیدن گذشته‌اند" : "در انتظار رسید"} tone={incoming.some((p) => p.po.expectedAt && p.po.expectedAt < new Date()) ? "warning" : "neutral"} icon={<Truck />} href="/panel/warehouse?tab=receive" />
        <Stat label="زیر نقطه سفارش" value={formatNumber(low.length)} sub="کالای نیازمند سفارش مجدد" tone={low.length ? "warning" : "neutral"} icon={<ArrowDownToLine />} href="/panel/inventory?low=1" />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <FilterTabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/panel/warehouse?tab=${t.key}`, count: counts[t.key] }))} />
          <Card className="overflow-hidden">
            {tab === "issue" && (
              toIssue.length === 0 ? <EmptyState icon={<PackageCheck />} title="حواله‌ای در صف نیست" description="مواد رزروشده برای سفارش‌ها اینجا به ترتیب موعد تحویل نمایش داده می‌شوند." /> : (
                <Table>
                  <THead><tr><TH>سفارش</TH><TH>ماده</TH><TH>مرحله مصرف</TH><TH className="text-end">رزرو</TH><TH className="text-end">باقی‌مانده</TH><TH>موعد</TH><TH /></tr></THead>
                  <TBody>
                    {toIssue.map((r) => {
                      const remaining = r.req.quantityRequired - r.req.quantityIssued;
                      const hot = isHot(r);
                      return (
                        <TR key={r.req.id} className={hot ? "bg-accent-soft/35" : undefined}>
                          <TD><Link href={`/panel/orders/${r.orderId}`} className="hover:text-accent-ink"><OrderNo n={r.orderNumber} /></Link>{r.priority !== "NORMAL" && <Status map={PRIORITY} value={r.priority} className="ms-2" />}<span className="block max-w-[180px] truncate text-[12px] text-muted">{r.itemTitle}</span></TD>
                          <TD><Link href={`/panel/inventory/${r.material.id}`} className="whitespace-nowrap font-bold hover:text-accent-ink">{r.material.name}</Link><span className="block text-[11.5px] text-muted"><Code>{r.material.sku}</Code></span></TD>
                          <TD>{r.stepName ?? "—"}{r.stepStatus && <Status map={TASK_STATUS} value={r.stepStatus} className="ms-2" />}</TD>
                          <TD className="text-end"><Num value={r.req.quantityReserved} decimals /></TD>
                          <TD className="text-end"><Num value={remaining} decimals /> <span className="text-[11px] text-muted">{UNIT[r.material.unit]}</span></TD>
                          <TD className="text-muted"><DateText value={r.dueDate} /></TD>
                          <TD className="text-end">{perms.has("inventory.issue") && <IssueButton req={{ id: r.req.id, materialName: r.material.name, unit: r.material.unit, reserved: r.req.quantityReserved, remaining }} />}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )
            )}

            {tab === "reserve" && (
              toReserve.length === 0 ? <EmptyState icon={<PackageCheck />} title="همه نیازها رزرو شده‌اند" /> : (
                <Table>
                  <THead><tr><TH>سفارش</TH><TH>ماده</TH><TH className="text-end">نیاز</TH><TH className="text-end">رزرو</TH><TH className="text-end">موجودی آزاد</TH><TH>وضعیت</TH><TH /></tr></THead>
                  <TBody>
                    {toReserve.map((r) => {
                      const s = stock.find((x) => x.id === r.material.id);
                      const need = r.req.quantityRequired - r.req.quantityReserved - r.req.quantityIssued;
                      const canCover = (s?.available ?? 0) > 0;
                      return (
                        <TR key={r.req.id}>
                          <TD><Link href={`/panel/orders/${r.orderId}`} className="hover:text-accent-ink"><OrderNo n={r.orderNumber} /></Link><span className="block max-w-[180px] truncate text-[12px] text-muted">{r.itemTitle}</span></TD>
                          <TD><Link href={`/panel/inventory/${r.material.id}`} className="whitespace-nowrap font-bold hover:text-accent-ink">{r.material.name}</Link>{(s?.onOrder ?? 0) > 0 && <span className="block text-[11.5px] text-info">در راه: {formatNumber(s!.onOrder, { decimals: true })}</span>}</TD>
                          <TD className="text-end"><Num value={r.req.quantityRequired} decimals /> <span className="text-[11px] text-muted">{UNIT[r.material.unit]}</span></TD>
                          <TD className="text-end"><Num value={r.req.quantityReserved} decimals /></TD>
                          <TD className={`text-end ${canCover ? "" : "text-danger"}`}><Num value={s?.available ?? 0} decimals /></TD>
                          <TD><Status map={REQUIREMENT_STATUS} value={r.req.status} /></TD>
                          <TD className="text-end">
                            <div className="flex justify-end gap-1">
                              {perms.has("inventory.reserve") && canCover && <ReserveButton requirementId={r.req.id} />}
                              {perms.has("procurement.manage") && !canCover && <MaterialRequestButton size="xs" materials={materialOptions} preset={{ materialId: r.material.id, quantity: Math.ceil(need) }} />}
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )
            )}

            {tab === "receive" && (
              incoming.length === 0 ? <EmptyState icon={<Truck />} title="سفارش خرید در راهی نیست" /> : (
                <ul className="divide-y divide-line">
                  {incoming.map(({ po, supplierName, lines }) => {
                    const late = po.expectedAt && po.expectedAt < new Date();
                    return (
                      <li key={po.id} className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">سفارش خرید {toFaDigits(po.number)}</span>
                          <span className="text-muted">· {supplierName}</span>
                          <Status map={PO_STATUS} value={po.status} />
                          {late && <Badge tone="warning">تأخیر در رسیدن</Badge>}
                          <span className="ms-auto flex items-center gap-2 text-[12.5px] text-muted">موعد رسیدن: <DateText value={po.expectedAt} /></span>
                          {perms.has("inventory.receive") && <ReceivePoButton po={{ id: po.id, number: po.number, supplierName, lines: lines.map((l) => ({ id: l.line.id, materialName: l.material.name, unit: l.material.unit, quantity: l.line.quantity, received: l.line.receivedQuantity })) }} />}
                        </div>
                        <ul className="mt-2 grid gap-1 text-[12.5px] text-ink-2 sm:grid-cols-2">
                          {lines.map((l) => (
                            <li key={l.line.id} className="flex justify-between gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
                              <span>{l.material.name}</span>
                              <span className="tabular">{formatNumber(l.line.receivedQuantity, { decimals: true })} / {formatNumber(l.line.quantity, { decimals: true })} {UNIT[l.material.unit]}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )
            )}

            {tab === "return" && (
              outstanding.length === 0 ? <EmptyState icon={<PackageCheck />} title="مواد برگشتی در انتظار نیست" description="وقتی تولید یک قلم تمام شود و بخشی از مواد حواله‌شده مصرف یا ضایع نشده باشد، اینجا برای برگشت به انبار نمایش داده می‌شود." /> : (
                <Table>
                  <THead><tr><TH>سفارش</TH><TH>ماده</TH><TH className="text-end">حواله</TH><TH className="text-end">مصرف</TH><TH className="text-end">ضایعات</TH><TH className="text-end">مانده</TH><TH /></tr></THead>
                  <TBody>
                    {outstanding.map((r) => {
                      const rest = r.req.quantityIssued - r.req.quantityConsumed - r.req.quantityWasted - r.req.quantityReturned;
                      return (
                        <TR key={r.req.id}>
                          <TD><Link href={`/panel/orders/${r.orderId}`} className="hover:text-accent-ink"><OrderNo n={r.orderNumber} /></Link><span className="block text-[12px] text-muted">{r.itemTitle}</span></TD>
                          <TD className="font-bold">{r.material.name}</TD>
                          <TD className="text-end"><Num value={r.req.quantityIssued} decimals /></TD>
                          <TD className="text-end"><Num value={r.req.quantityConsumed} decimals /></TD>
                          <TD className="text-end text-danger"><Num value={r.req.quantityWasted} decimals /></TD>
                          <TD className="text-end font-bold"><Num value={rest} decimals /> <span className="text-[11px] font-medium text-muted">{UNIT[r.material.unit]}</span></TD>
                          <TD className="text-end">{perms.has("inventory.issue") && <ReturnButton req={{ id: r.req.id, materialName: r.material.name, unit: r.material.unit, outstanding: rest }} />}</TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              )
            )}

            {tab === "ledger" && (
              <Table>
                <THead><tr><TH>زمان</TH><TH>نوع</TH><TH>ماده</TH><TH className="text-end">مقدار</TH><TH>سفارش</TH><TH>شرح</TH><TH>کاربر</TH></tr></THead>
                <TBody>
                  {ledger.map(({ tx, material, by, orderNumber }) => (
                    <TR key={tx.id}>
                      <TD className="text-muted"><DateText value={tx.createdAt} withTime /></TD>
                      <TD><Status map={INV_TX} value={tx.type} /></TD>
                      <TD><Link href={`/panel/inventory/${material.id}`} className="hover:text-accent-ink">{material.name}</Link></TD>
                      <TD className="text-end"><Num value={tx.quantity} decimals /> <span className="text-[11px] text-muted">{UNIT[material.unit]}</span></TD>
                      <TD>{orderNumber ? <OrderNo n={orderNumber} /> : "—"}</TD>
                      <TD className="max-w-[240px] truncate text-[12.5px] text-muted">{tx.reason ?? ""}</TD>
                      <TD className="text-[12.5px] text-muted">{by ?? "سیستم"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>

        <aside className="grid content-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          <Card>
            <CardHeader title="زیر نقطه سفارش" description="موجودی آزاد کمتر از حد سفارش مجدد یا دارای کمبود" icon={<ArrowDownToLine />} />
            <CardBody className="pt-0">
              {low.length === 0 ? <p className="text-[13px] text-muted">همه اقلام بالاتر از نقطه سفارش هستند.</p> : (
                <ul className="space-y-2">
                  {low.slice(0, 10).map((s) => (
                    <li key={s.id}>
                      <Link href={`/panel/inventory/${s.id}`} className="block rounded-lg border border-line px-3 py-2 text-[12.5px] hover:border-line-strong">
                        <span className="font-bold">{s.name}</span>
                        <span className="mt-0.5 flex justify-between text-muted">
                          <span>آزاد <b className="tabular text-ink">{formatNumber(s.available, { decimals: true })}</b> از نقطه {formatNumber(s.reorderPoint)}</span>
                          {s.shortage > 0 && <span className="text-danger">کمبود {formatNumber(s.shortage, { decimals: true })}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="انبارها" />
            <CardBody className="pt-0 text-[13px]">
              <ul className="space-y-1.5">{locations.map((l) => <li key={l.id} className="flex justify-between"><span>{l.name}</span><Code className="text-muted">{l.code}</Code></li>)}</ul>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
