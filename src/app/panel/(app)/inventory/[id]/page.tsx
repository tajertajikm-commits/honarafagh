import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Code, DateText, Money, Num, OrderNo } from "@/components/ui/misc";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { KV, PageHeader, Stat } from "@/components/panel/page";
import { IssueButton, MaterialRequestButton, ReceiveStockButton, ReserveButton, StockCorrection } from "@/components/panel/inventory-actions";
import { INV_TX, PO_STATUS, REQUIREMENT_STATUS, UNIT } from "@/lib/labels";
import { formatNumber, toFaDigits } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { listCategoriesAndLocations, materialDetail } from "@/server/modules/inventory/queries";

export const metadata: Metadata = { title: "کارت کالا" };

const signed = (n: number) => (n === 0 ? "—" : `${n > 0 ? "+" : "−"}${formatNumber(Math.abs(n), { decimals: true })}`);

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireStaffPage({ permission: "inventory.view" });
  const d = await materialDetail(ctx, id, { ledgerLimit: 150 });
  const { locations } = await listCategoriesAndLocations(ctx);
  const perms = ctx.actor.permissions;
  const m = d.material;
  const unit = UNIT[m.unit] ?? m.unit;
  const onHand = d.levels.reduce((s, l) => s + l.level.onHand, 0);
  const reserved = d.levels.reduce((s, l) => s + l.level.reserved, 0);
  const onOrder = d.incoming.filter((x) => x.po.status !== "DRAFT").reduce((s, x) => s + Math.max(0, x.line.quantity - x.line.receivedQuantity), 0);
  const locs = locations.map((l) => {
    const lv = d.levels.find((x) => x.location.id === l.id)?.level;
    return { id: l.id, code: l.code, name: l.name, onHand: lv?.onHand ?? 0, available: (lv?.onHand ?? 0) - (lv?.reserved ?? 0) };
  });
  const option = { id: m.id, sku: m.sku, name: m.name, unit: m.unit, defaultLocationId: m.defaultLocationId };
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/panel/inventory", label: "موجودی کالا" }]}
        title={m.name}
        description={<><Code>{m.sku}</Code> · {d.categoryName}{d.supplierName && ` · تأمین‌کننده پیش‌فرض: ${d.supplierName}`}</>}
        actions={
          <>
            {perms.has("procurement.manage") && <MaterialRequestButton materials={[option]} preset={{ materialId: m.id, quantity: m.reorderQuantity || undefined }} />}
            {perms.has("inventory.adjust") && <StockCorrection material={option} locations={locs} mode="adjust" />}
            {perms.has("inventory.waste") && <StockCorrection material={option} locations={locs} mode="waste" />}
            {perms.has("inventory.receive") && <ReceiveStockButton materials={[option]} locations={locations} preset={m.id} />}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="موجودی فیزیکی" value={<>{formatNumber(onHand, { decimals: true })} <span className="text-[13px] text-muted">{unit}</span></>} />
        <Stat label="رزرو برای سفارش‌ها" value={formatNumber(reserved, { decimals: true })} />
        <Stat label="موجودی آزاد" value={formatNumber(onHand - reserved, { decimals: true })} tone={onHand - reserved <= m.reorderPoint ? "warning" : "success"} sub={`نقطه سفارش ${formatNumber(m.reorderPoint)} · مقدار سفارش ${formatNumber(m.reorderQuantity)}`} />
        <Stat label="در راه" value={formatNumber(onOrder, { decimals: true })} tone={onOrder ? "info" : "neutral"} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Card className="overflow-hidden">
            <CardHeader title="نیاز سفارش‌های باز" description="رزرو و حواله به ترتیب موعد سفارش" />
            {d.requirements.length === 0 ? <p className="px-5 pb-5 text-[13px] text-muted">سفارش بازی به این کالا نیاز ندارد.</p> : (
              <Table>
                <THead><tr><TH>سفارش</TH><TH className="text-end">نیاز</TH><TH className="text-end">رزرو</TH><TH className="text-end">حواله</TH><TH>وضعیت</TH><TH>موعد</TH><TH /></tr></THead>
                <TBody>
                  {d.requirements.map((r) => {
                    const remaining = r.req.quantityRequired - r.req.quantityIssued;
                    return (
                      <TR key={r.req.id}>
                        <TD><Link href={`/panel/orders/${r.orderId}`} className="hover:text-accent-ink"><OrderNo n={r.orderNumber} /></Link><span className="block text-[12px] text-muted">{r.itemTitle}</span></TD>
                        <TD className="text-end"><Num value={r.req.quantityRequired} decimals /></TD>
                        <TD className="text-end"><Num value={r.req.quantityReserved} decimals /></TD>
                        <TD className="text-end"><Num value={r.req.quantityIssued} decimals /></TD>
                        <TD><Status map={REQUIREMENT_STATUS} value={r.req.status} /></TD>
                        <TD className="text-muted"><DateText value={r.dueDate} /></TD>
                        <TD className="text-end">
                          <div className="flex justify-end gap-1">
                            {perms.has("inventory.reserve") && ["PENDING", "SHORTAGE", "PARTIALLY_RESERVED"].includes(r.req.status) && onHand - reserved > 0 && <ReserveButton requirementId={r.req.id} />}
                            {perms.has("inventory.issue") && remaining > 0 && <IssueButton req={{ id: r.req.id, materialName: m.name, unit: m.unit, reserved: r.req.quantityReserved, remaining }} />}
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </Card>
          <Card className="overflow-hidden">
            <CardHeader title="دفتر تراکنش‌ها" description="ثبت‌ها قابل ویرایش یا حذف نیستند؛ اصلاح فقط با تراکنش جدید انجام می‌شود." />
            <Table>
              <THead><tr><TH>زمان</TH><TH>نوع</TH><TH className="text-end">موجودی</TH><TH className="text-end">رزرو</TH><TH>انبار</TH><TH>سفارش</TH><TH>شرح</TH><TH>کاربر</TH></tr></THead>
              <TBody>
                {d.ledger.map(({ tx, locationCode, by, orderNumber }) => (
                  <TR key={tx.id}>
                    <TD className="text-muted"><DateText value={tx.createdAt} withTime /></TD>
                    <TD><Status map={INV_TX} value={tx.type} /></TD>
                    <TD className={`text-end tabular ${tx.onHandDelta < 0 ? "text-danger" : tx.onHandDelta > 0 ? "text-success" : "text-subtle"}`} dir="ltr">{signed(tx.onHandDelta)}</TD>
                    <TD className="text-end tabular text-muted" dir="ltr">{signed(tx.reservedDelta)}</TD>
                    <TD><Code className="text-muted">{locationCode ?? "—"}</Code></TD>
                    <TD>{orderNumber ? <OrderNo n={orderNumber} /> : "—"}</TD>
                    <TD className="max-w-[220px] truncate text-[12.5px] text-muted" title={tx.reason ?? ""}>{tx.reason ?? ""}</TD>
                    <TD className="text-[12.5px] text-muted">{by ?? "سیستم"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader title="موجودی به تفکیک انبار" />
            <CardBody className="pt-0">
              {d.levels.length === 0 ? <p className="text-[13px] text-muted">موجودی ثبت نشده است.</p> : d.levels.map(({ level, location }) => (
                <KV key={location.id} label={location.name}>
                  <span className="tabular">{formatNumber(level.onHand, { decimals: true })}</span>
                  {level.reserved > 0 && <span className="ms-1 text-[12px] text-muted">(رزرو {formatNumber(level.reserved, { decimals: true })})</span>}
                </KV>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="مشخصات" />
            <CardBody className="pt-0">
              <KV label="واحد">{unit}</KV>
              <KV label="بهای استاندارد"><Money rial={m.standardCost} /></KV>
              {m.paperType && <KV label="نوع کاغذ">{m.paperType}</KV>}
              {m.grammage && <KV label="گرماژ">{toFaDigits(m.grammage)} گرم</KV>}
              {m.sheetWidthMm && <KV label="ابعاد برگ"><span dir="ltr" className="tabular">{toFaDigits(m.sheetWidthMm)}×{toFaDigits(m.sheetHeightMm ?? 0)}</span> میلی‌متر</KV>}
              {m.brand && <KV label="برند">{m.brand}</KV>}
            </CardBody>
          </Card>
          {d.incoming.length > 0 && (
            <Card>
              <CardHeader title="سفارش‌های خرید" />
              <CardBody className="space-y-2 pt-0 text-[12.5px]">
                {d.incoming.map((x) => (
                  <div key={x.line.id} className="rounded-lg border border-line px-3 py-2">
                    <div className="flex items-center justify-between"><span className="font-bold">سفارش خرید {toFaDigits(x.po.number)}</span><Status map={PO_STATUS} value={x.po.status} /></div>
                    <p className="mt-0.5 text-muted">{x.supplierName} · {formatNumber(x.line.receivedQuantity, { decimals: true })} از {formatNumber(x.line.quantity, { decimals: true })} رسیده · موعد <DateText value={x.po.expectedAt} /></p>
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
