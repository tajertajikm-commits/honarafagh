import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { ClipboardList, FileText, PackageSearch, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Code, DateText, EmptyState, Money } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton, ReasonAction } from "@/components/panel/actions";
import { ReceivePoButton } from "@/components/panel/inventory-actions";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { RequestsTable, SupplierDialog } from "@/components/panel/procurement";
import { PO_STATUS, UNIT } from "@/lib/labels";
import { formatNumber, toFaDigits } from "@/lib/persian";
import { materials as materialsTable } from "@/server/db/schema";
import { requireStaffPage } from "@/server/http/session";
import { listMaterialRequests, listPurchaseOrders, listStock, listSuppliers } from "@/server/modules/inventory/queries";

export const metadata: Metadata = { title: "تأمین و خرید" };

const TABS = [
  { key: "requests", label: "درخواست‌های خرید" },
  { key: "orders", label: "سفارش‌های خرید" },
  { key: "suppliers", label: "تأمین‌کنندگان" },
] as const;

const OPEN_PO = ["ORDERED", "PARTIALLY_RECEIVED"];

export default async function ProcurementPage({ searchParams }: { searchParams: Promise<{ tab?: string; all?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ workspace: "procurement", permission: "procurement.view" });
  const perms = ctx.actor.permissions;
  const canManage = perms.has("procurement.manage");
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "requests";

  const requests = await listMaterialRequests(ctx, { status: sp.all ? undefined : ["OPEN", "ORDERED"] });
  const pos = await listPurchaseOrders(ctx, { status: sp.all ? undefined : ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"] });
  const suppliers = await listSuppliers(ctx, { includeInactive: true });
  const stock = await listStock(ctx);
  const mats = await ctx.db.select().from(materialsTable).where(eq(materialsTable.isActive, true)).orderBy(asc(materialsTable.name));
  const materialPicks = mats.map((m) => ({ id: m.id, sku: m.sku, name: m.name, unit: m.unit, standardCost: m.standardCost, defaultSupplierId: m.defaultSupplierId, defaultLocationId: m.defaultLocationId }));
  const now = new Date();
  const openReq = requests.filter((r) => r.request.status === "OPEN");
  const inFlight = pos.filter((p) => OPEN_PO.includes(p.po.status));
  const lateCount = inFlight.filter((p) => p.po.expectedAt && p.po.expectedAt < now).length;
  const onOrderValue = inFlight.reduce((s, p) => s + p.lines.reduce((x, l) => x + Math.max(0, l.line.quantity - l.line.receivedQuantity) * l.line.unitCost, 0), 0);
  const belowReorder = stock.filter((s) => s.available + s.onOrder <= s.reorderPoint);
  const allHref = (t: string) => (sp.all ? `/panel/procurement?tab=${t}` : `/panel/procurement?tab=${t}&all=1`);

  return (
    <>
      <PageHeader title="تأمین و خرید" description="درخواست‌های خرید حاصل از کمبود سفارش‌ها و نقطه سفارش، سفارش خرید و پیگیری رسیدن کالا" actions={canManage && tab === "suppliers" && <SupplierDialog trigger="new" />} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="درخواست باز" value={formatNumber(openReq.length)} sub={`${formatNumber(openReq.filter((r) => r.request.reason === "SHORTAGE").length)} مورد مربوط به کمبود سفارش`} tone={openReq.length ? "accent" : "neutral"} icon={<ClipboardList />} href="/panel/procurement?tab=requests" />
        <Stat label="سفارش خرید در جریان" value={formatNumber(inFlight.length)} sub={<>ارزش در راه: <Money rial={onOrderValue} /></>} icon={<FileText />} href="/panel/procurement?tab=orders" />
        <Stat label="تأخیر تأمین‌کننده" value={formatNumber(lateCount)} sub="از موعد رسیدن گذشته" tone={lateCount ? "danger" : "neutral"} icon={<Truck />} href="/panel/procurement?tab=orders" />
        <Stat label="نیازمند سفارش" value={formatNumber(belowReorder.length)} sub="موجودی آزاد + در راه ≤ نقطه سفارش" tone={belowReorder.length ? "warning" : "neutral"} icon={<PackageSearch />} href="/panel/inventory?low=1" />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <FilterTabs
          active={tab}
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `/panel/procurement?tab=${t.key}${sp.all ? "&all=1" : ""}`, count: t.key === "requests" ? openReq.length : t.key === "orders" ? pos.filter((p) => p.po.status !== "RECEIVED" && p.po.status !== "CANCELLED").length : suppliers.filter((s) => s.s.isActive).length }))}
        />
        {tab !== "suppliers" && <a href={allHref(tab)} className="py-1.5 text-[13px] font-bold text-accent-ink">{sp.all ? "فقط موارد باز" : "نمایش سوابق"}</a>}
      </div>
      <Card className="overflow-hidden">
        {tab === "requests" && (
          <RequestsTable
            canManage={canManage}
            suppliers={suppliers.filter((s) => s.s.isActive).map((s) => ({ id: s.s.id, name: s.s.name, leadTimeDays: s.s.leadTimeDays }))}
            materials={materialPicks}
            requests={requests.map((r) => ({
              id: r.request.id,
              number: r.request.number,
              status: r.request.status,
              reason: r.request.reason,
              quantity: r.request.quantity,
              neededBy: r.request.neededBy?.toISOString() ?? null,
              orderNumber: r.orderNumber,
              note: r.request.note,
              requestedBy: r.requestedBy,
              material: materialPicks.find((m) => m.id === r.material.id) ?? r.material,
            }))}
          />
        )}

        {tab === "orders" &&
          (pos.length === 0 ? (
            <EmptyState icon={<FileText />} title="سفارش خریدی وجود ندارد" description="از زبانه درخواست‌ها، درخواست‌ها را انتخاب کنید و سفارش خرید بسازید." />
          ) : (
            <ul className="divide-y divide-line">
              {pos.map(({ po, supplierName, lines }) => {
                const late = po.expectedAt && po.expectedAt < now && OPEN_PO.includes(po.status);
                return (
                  <li key={po.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">سفارش خرید {toFaDigits(po.number)}</span>
                      <span className="text-muted">· {supplierName}</span>
                      <Status map={PO_STATUS} value={po.status} />
                      {late && <Badge tone="danger">تأخیر</Badge>}
                      <span className="text-[12.5px] text-muted">· رسیدن: <DateText value={po.expectedAt} /></span>
                      <span className="ms-auto flex items-center gap-2">
                        <Money rial={po.totalAmount} strong />
                        {canManage && po.status === "DRAFT" && <ActionButton size="xs" path={`procurement/purchase-orders/${po.id}/submit`} success="سفارش خرید ارسال شد.">ثبت و ارسال</ActionButton>}
                        {perms.has("inventory.receive") && OPEN_PO.includes(po.status) && (
                          <ReceivePoButton po={{ id: po.id, number: po.number, supplierName, lines: lines.map((l) => ({ id: l.line.id, materialName: l.material.name, unit: l.material.unit, quantity: l.line.quantity, received: l.line.receivedQuantity })) }} />
                        )}
                        {canManage && ["DRAFT", "ORDERED"].includes(po.status) && (
                          <ReasonAction size="xs" variant="ghost" danger path={`procurement/purchase-orders/${po.id}/cancel`} title={`لغو سفارش خرید ${toFaDigits(po.number)}`} description="درخواست‌های مرتبط دوباره باز می‌شوند." success="سفارش خرید لغو شد.">لغو</ReasonAction>
                        )}
                      </span>
                    </div>
                    <div className="mt-2 overflow-hidden rounded-lg border border-line">
                      <Table>
                        <TBody>
                          {lines.map((l) => (
                            <TR key={l.line.id}>
                              <TD className="py-2">{l.material.name} <Code className="text-[11px] text-muted">{l.material.sku}</Code></TD>
                              <TD className="py-2 text-end tabular text-muted">{formatNumber(l.line.receivedQuantity, { decimals: true })} / {formatNumber(l.line.quantity, { decimals: true })} {UNIT[l.material.unit]}</TD>
                              <TD className="py-2 text-end text-muted"><Money rial={l.line.unitCost} unit={false} /></TD>
                              <TD className="py-2 text-end"><Money rial={l.line.quantity * l.line.unitCost} /></TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </div>
                    {po.note && <p className="mt-2 text-[12.5px] text-muted">{po.note}</p>}
                  </li>
                );
              })}
            </ul>
          ))}

        {tab === "suppliers" && (
          <Table>
            <THead>
              <tr><TH>تأمین‌کننده</TH><TH>رابط</TH><TH>تلفن</TH><TH className="text-end">زمان تأمین</TH><TH className="text-end">سفارش باز</TH><TH className="text-end">جمع خرید</TH><TH /></tr>
            </THead>
            <TBody>
              {suppliers.map(({ s, openOrders, totalPurchased }) => (
                <TR key={s.id} className={s.isActive ? undefined : "opacity-55"}>
                  <TD className="font-bold">{s.name}{!s.isActive && <Badge className="ms-2">غیرفعال</Badge>}</TD>
                  <TD className="text-muted">{s.contactName ?? "—"}</TD>
                  <TD>{s.phone ? <Code>{s.phone}</Code> : "—"}</TD>
                  <TD className="text-end">{formatNumber(s.leadTimeDays)} روز</TD>
                  <TD className="text-end tabular">{formatNumber(openOrders)}</TD>
                  <TD className="text-end"><Money rial={totalPurchased} /></TD>
                  <TD className="text-end">{canManage && <SupplierDialog trigger="edit" supplier={{ id: s.id, name: s.name, contactName: s.contactName, phone: s.phone, email: s.email, address: s.address, leadTimeDays: s.leadTimeDays, notes: s.notes, isActive: s.isActive }} />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
