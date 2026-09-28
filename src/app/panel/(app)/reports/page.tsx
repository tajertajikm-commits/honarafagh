import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Money } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarList, ColumnChart } from "@/components/panel/charts";
import { FilterTabs, PageHeader, Stat } from "@/components/panel/page";
import { ISSUE_TYPE, METHOD, PAYMENT_METHOD, UNIT } from "@/lib/labels";
import { formatDayMonth, formatDuration, formatNumber, formatPercent, formatToman } from "@/lib/persian";
import { requireStaffPage } from "@/server/http/session";
import { employeesReport, financeReport, inventoryReport, machinesReport, procurementReport, productionReport, rangeFromDays, salesReport, wasteReport } from "@/server/modules/reports/service";

export const metadata: Metadata = { title: "گزارش‌ها" };

const TABS = [
  { key: "sales", label: "فروش" },
  { key: "finance", label: "مالی" },
  { key: "production", label: "تولید" },
  { key: "waste", label: "ضایعات" },
  { key: "inventory", label: "انبار" },
  { key: "machines", label: "ماشین‌آلات" },
  { key: "employees", label: "کارکنان" },
  { key: "procurement", label: "تأمین" },
] as const;
const RANGES = [7, 30, 90, 365];
const SOURCE: Record<string, string> = { WEBSITE: "فروشگاه اینترنتی", SALES: "فروش حضوری", PHONE: "تلفنی", QUOTE: "پیش‌فاکتور", API: "API" };
const AGING: Record<string, string> = { "0-7": "تا ۷ روز", "8-30": "۸ تا ۳۰ روز", "31-60": "۳۱ تا ۶۰ روز", "60+": "بیش از ۶۰ روز" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string; days?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireStaffPage({ permission: "report.view" });
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "sales";
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const range = rangeFromDays(days);
  const href = (t: string, d = days) => `/panel/reports?tab=${t}&days=${d}`;

  return (
    <>
      <PageHeader
        title="گزارش‌ها"
        description="همه اعداد از رکوردهای عملیاتی (سفارش، پرداخت، دفتر انبار، ثبت زمان) محاسبه می‌شوند."
        actions={
          <div className="flex gap-1 rounded-lg bg-surface-2 p-1">
            {RANGES.map((d) => (
              <a key={d} href={href(tab, d)} aria-current={d === days ? "true" : undefined} className={`rounded-md px-3 py-1 text-[12.5px] font-bold ${d === days ? "bg-surface shadow-soft" : "text-muted hover:text-ink"}`}>{d === 365 ? "یک سال" : `${formatNumber(d)} روز`}</a>
            ))}
          </div>
        }
      />
      <FilterTabs active={tab} tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: href(t.key) }))} />
      {tab === "sales" && <Sales range={range} ctx={ctx} />}
      {tab === "finance" && <Finance range={range} ctx={ctx} />}
      {tab === "production" && <Production range={range} ctx={ctx} />}
      {tab === "waste" && <Waste range={range} ctx={ctx} />}
      {tab === "inventory" && <Inventory range={range} ctx={ctx} />}
      {tab === "machines" && <Machines range={range} ctx={ctx} />}
      {tab === "employees" && <Employees range={range} ctx={ctx} />}
      {tab === "procurement" && <Procurement range={range} ctx={ctx} />}
    </>
  );
}

type P = { range: ReturnType<typeof rangeFromDays>; ctx: Awaited<ReturnType<typeof requireStaffPage>> };
const grid = "grid gap-6 xl:grid-cols-2";

async function Sales({ range, ctx }: P) {
  const r = await salesReport(ctx, range);
  const margin = r.byProduct.reduce((s, p) => s + p.revenue, 0) ? (1 - r.byProduct.reduce((s, p) => s + p.cost, 0) / r.byProduct.reduce((s, p) => s + p.revenue, 0)) * 100 : 0;
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="فروش (مبلغ سفارش‌ها)" value={<Money rial={r.revenue} />} />
        <Stat label="تعداد سفارش" value={formatNumber(r.orders)} sub={r.cancelled ? `${formatNumber(r.cancelled)} لغو شده` : undefined} />
        <Stat label="میانگین سفارش" value={<Money rial={r.avgOrder} />} />
        <Stat label="حاشیه سود برآوردی" value={formatPercent(margin)} sub="بر اساس بهای تمام‌شده ثبت‌شده در سفارش" />
      </div>
      <div className={grid}>
        <Card className="xl:col-span-2"><CardHeader title="فروش روزانه" description="هزار تومان" /><CardBody className="pt-0"><ColumnChart title="فروش روزانه" data={r.byDay.map((d) => ({ label: formatDayMonth(`${d.day}T12:00:00Z`), value: Math.round(d.revenue / 10_000), display: `${formatDayMonth(`${d.day}T12:00:00Z`)}: ${formatToman(d.revenue)}` }))} /></CardBody></Card>
        <Card><CardHeader title="محصولات" description="مبلغ فروش" /><CardBody className="pt-0"><BarList data={r.byProduct.map((p) => ({ label: p.name, value: p.revenue, display: formatToman(p.revenue), hint: `${formatNumber(p.qty)} عدد` }))} /></CardBody></Card>
        <Card><CardHeader title="مشتریان برتر" /><CardBody className="pt-0"><BarList data={r.topCustomers.map((c) => ({ label: c.name, value: c.revenue, display: formatToman(c.revenue), hint: `${formatNumber(c.orders)} سفارش` }))} /></CardBody></Card>
        <Card><CardHeader title="کانال فروش" /><CardBody className="pt-0"><BarList data={r.bySource.map((s) => ({ label: SOURCE[s.source] ?? s.source, value: s.revenue, display: `${formatToman(s.revenue)} • ${formatNumber(s.orders)} سفارش` }))} /></CardBody></Card>
        <Card><CardHeader title="روش تولید" /><CardBody className="pt-0"><BarList data={r.byMethod.map((m) => ({ label: METHOD[m.method] ?? "سفارشی", value: m.revenue, display: `${formatToman(m.revenue)} • ${formatNumber(m.items)} قلم` }))} /></CardBody></Card>
      </div>
    </>
  );
}

async function Finance({ range, ctx }: P) {
  const r = await financeReport(ctx, range);
  const payments = r.byMethod.filter((m) => m.kind === "PAYMENT");
  const outstanding = r.aging.reduce((s, a) => s + a.amount, 0);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="وصول‌شده" value={<Money rial={r.collected} />} />
        <Stat label="بازپرداخت" value={<Money rial={r.refunded} />} />
        <Stat label="مانده مطالبات (امروز)" value={<Money rial={outstanding} />} tone={outstanding ? "warning" : "neutral"} />
        <Stat label="سود ناخالص سفارش‌های تکمیل‌شده" value={<Money rial={r.completedRevenue - r.completedCost} />} sub={r.completedRevenue ? `حاشیه ${formatPercent((1 - r.completedCost / r.completedRevenue) * 100)}` : undefined} />
      </div>
      <div className={grid}>
        <Card><CardHeader title="وصول به تفکیک روش" /><CardBody className="pt-0"><BarList data={payments.sort((a, b) => b.amount - a.amount).map((m) => ({ label: PAYMENT_METHOD[m.method] ?? m.method, value: m.amount, display: `${formatToman(m.amount)} • ${formatNumber(m.count)} تراکنش` }))} /></CardBody></Card>
        <Card><CardHeader title="سن مطالبات" description="بر اساس تاریخ ثبت سفارش" /><CardBody className="pt-0"><BarList data={["0-7", "8-30", "31-60", "60+"].map((b) => { const a = r.aging.find((x) => x.bucket === b); return { label: AGING[b]!, value: a?.amount ?? 0, display: `${formatToman(a?.amount ?? 0)} • ${formatNumber(a?.orders ?? 0)} سفارش`, tone: b === "60+" || b === "31-60" ? "danger" as const : "series" as const }; })} /></CardBody></Card>
      </div>
    </>
  );
}

async function Production({ range, ctx }: P) {
  const r = await productionReport(ctx, range);
  const passed = r.qc.find((q) => q.result === "PASSED");
  const failed = r.qc.find((q) => q.result === "FAILED");
  const inspections = (passed?.count ?? 0) + (failed?.count ?? 0);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="سفارش آماده‌شده" value={formatNumber(r.delivered)} />
        <Stat label="تحویل به‌موقع" value={r.delivered ? formatPercent((r.onTime / r.delivered) * 100) : "—"} tone={r.delivered && r.onTime / r.delivered < 0.85 ? "warning" : "success"} />
        <Stat label="میانگین زمان تا آماده‌شدن" value={`${formatNumber(r.avgLeadDays, { decimals: true })} روز`} />
        <Stat label="قبولی کنترل کیفیت (اولین بار)" value={inspections ? formatPercent(((passed?.count ?? 0) / inspections) * 100) : "—"} sub={failed ? `${formatNumber(failed.rejected)} عدد مردودی` : undefined} />
      </div>
      <div className={grid}>
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="مراحل تکمیل‌شده" description="زمان برنامه در برابر زمان واقعی ثبت‌شده؛ دوباره‌کاری یعنی اجرای دوم به بعد یک مرحله." />
          <Table>
            <THead><tr><TH>مرحله</TH><TH className="text-end">تکمیل</TH><TH className="text-end">زمان برنامه</TH><TH className="text-end">زمان واقعی</TH><TH className="text-end">انحراف</TH><TH className="text-end">دوباره‌کاری</TH></tr></THead>
            <TBody>
              {r.bySteps.map((s) => {
                const dev = s.planned && s.actual >= 1 ? ((s.actual - s.planned) / s.planned) * 100 : 0;
                return (
                  <TR key={s.step}>
                    <TD className="font-bold">{s.name}</TD>
                    <TD className="text-end tabular">{formatNumber(s.completed)}</TD>
                    <TD className="text-end">{formatDuration(s.planned)}</TD>
                    <TD className="text-end">{formatDuration(s.actual)}</TD>
                    <TD className={`text-end tabular ${dev > 15 ? "text-danger" : dev < -15 ? "text-success" : "text-muted"}`}>{s.planned && s.actual >= 1 ? `${dev > 0 ? "+" : ""}${formatPercent(dev, 0)}` : "—"}</TD>
                    <TD className={`text-end tabular ${s.rework ? "text-warning" : "text-muted"}`}>{formatNumber(s.rework)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
        <Card><CardHeader title="مشکلات گزارش‌شده" /><CardBody className="pt-0"><BarList data={r.issues.map((i) => ({ label: ISSUE_TYPE[i.type] ?? i.type, value: i.count, display: `${formatNumber(i.count)}${i.open ? ` (${formatNumber(i.open)} باز)` : ""}`, tone: "warning" as const }))} empty="مشکلی ثبت نشده است." /></CardBody></Card>
      </div>
    </>
  );
}

async function Waste({ range, ctx }: P) {
  const r = await wasteReport(ctx, range);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="ارزش ضایعات مواد" value={<Money rial={r.totalValue} />} tone={r.totalValue ? "warning" : "neutral"} />
        <Stat label="تعداد مردودی کنترل کیفیت" value={formatNumber(r.defects.reduce((s, d) => s + d.qty, 0))} />
      </div>
      <div className={grid}>
        <Card className="overflow-hidden">
          <CardHeader title="ضایعات به تفکیک ماده" description="نسبت به مصرف همان ماده در بازه" />
          <Table>
            <THead><tr><TH>ماده</TH><TH className="text-end">ضایعات</TH><TH className="text-end">نرخ</TH><TH className="text-end">ارزش</TH></tr></THead>
            <TBody>
              {r.byMaterial.map((m) => (
                <TR key={m.name}>
                  <TD className="font-bold">{m.name}</TD>
                  <TD className="text-end tabular">{formatNumber(m.qty, { decimals: true })} <span className="text-[11px] text-muted">{UNIT[m.unit]}</span></TD>
                  <TD className="text-end tabular">{m.consumed ? formatPercent((m.qty / (m.qty + m.consumed)) * 100) : "—"}</TD>
                  <TD className="text-end"><Money rial={m.value} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {r.byMaterial.length === 0 && <p className="px-5 pb-5 text-[13px] text-muted">ضایعاتی ثبت نشده است.</p>}
        </Card>
        <div className="space-y-6">
          <Card><CardHeader title="ضایعات به تفکیک مرحله" /><CardBody className="pt-0"><BarList data={r.byStep.map((s) => ({ label: s.step, value: s.value, display: formatToman(s.value), tone: "danger" as const }))} /></CardBody></Card>
          <Card><CardHeader title="عیوب کنترل کیفیت" /><CardBody className="pt-0"><BarList data={r.defects.map((d) => ({ label: d.name, value: d.qty, display: `${formatNumber(d.qty)} عدد • ${formatNumber(d.count)} مورد`, tone: "warning" as const }))} empty="عیبی ثبت نشده است." /></CardBody></Card>
        </div>
      </div>
    </>
  );
}

async function Inventory({ range, ctx }: P) {
  const r = await inventoryReport(ctx, range);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="ارزش موجودی" value={<Money rial={r.totalValue} />} />
        <Stat label="ارزش مصرف در بازه" value={<Money rial={r.consumption.reduce((s, c) => s + c.value, 0)} />} />
        <Stat label="تراکنش‌های انبار" value={formatNumber(r.movements.reduce((s, m) => s + m.count, 0))} />
      </div>
      <div className={grid}>
        <Card><CardHeader title="ارزش موجودی به تفکیک گروه" /><CardBody className="pt-0"><BarList data={r.byCategory.map((c) => ({ label: c.name, value: c.value, display: `${formatToman(c.value)}${c.reserved ? ` • رزرو ${formatToman(c.reserved, { unit: false })}` : ""}` }))} /></CardBody></Card>
        <Card><CardHeader title="بیشترین مصرف" /><CardBody className="pt-0"><BarList data={r.consumption.map((c) => ({ label: c.name, value: c.value, display: `${formatToman(c.value)} • ${formatNumber(c.qty, { decimals: true })} ${UNIT[c.unit] ?? ""}` }))} /></CardBody></Card>
      </div>
    </>
  );
}

async function Machines({ range, ctx }: P) {
  const r = await machinesReport(ctx, range);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="بهره‌وری ماشین‌ها" description={`زمان کار ثبت‌شده نسبت به ساعات کاری تقویم (${formatDuration(r.available)} در بازه)`} />
      <Table>
        <THead><tr><TH>ماشین</TH><TH className="w-1/3">بهره‌وری</TH><TH className="text-end">زمان کار</TH><TH className="text-end">کار تکمیل‌شده</TH><TH className="text-end">تعمیرات</TH></tr></THead>
        <TBody>
          {r.machines.map((m) => (
            <TR key={m.id}>
              <TD className="font-bold">{m.name} <bdi dir="ltr" className="text-[11px] font-medium text-subtle">{m.code}</bdi></TD>
              <TD>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${Math.max(m.utilization > 0 ? 2 : 0, m.utilization * 100)}%`, background: "var(--color-series)" }} /></div>
                  <span className="w-12 text-end text-[12.5px] tabular">{formatPercent(m.utilization * 100, 0)}</span>
                </div>
              </TD>
              <TD className="text-end">{formatDuration(m.minutes)}</TD>
              <TD className="text-end tabular">{formatNumber(m.tasks)}</TD>
              <TD className="text-end text-muted">{m.maintenance ? formatDuration(m.maintenance) : "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

async function Employees({ range, ctx }: P) {
  const list = await employeesReport(ctx, range);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="کار ثبت‌شده کارکنان" description="بر اساس شروع و پایان کار در ایستگاه‌ها" />
      <Table>
        <THead><tr><TH>کارمند</TH><TH className="text-end">زمان کار</TH><TH className="text-end">مراحل تکمیل‌شده</TH><TH className="text-end">هزینه دستمزد</TH></tr></THead>
        <TBody>
          {list.map((e) => (
            <TR key={e.name}>
              <TD><span className="font-bold">{e.name}</span>{e.title && <span className="block text-[12px] text-muted">{e.title}</span>}</TD>
              <TD className="text-end">{e.minutes ? formatDuration(e.minutes) : "—"}</TD>
              <TD className="text-end tabular">{formatNumber(e.tasks)}</TD>
              <TD className="text-end">{e.minutes && e.hourly ? <Money rial={(e.minutes / 60) * e.hourly} /> : "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

async function Procurement({ range, ctx }: P) {
  const r = await procurementReport(ctx, range);
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="درخواست خرید" value={formatNumber(r.requests.total)} sub={`${formatNumber(r.requests.shortage)} از کمبود سفارش`} />
        <Stat label="درخواست باز" value={formatNumber(r.requests.open)} tone={r.requests.open ? "warning" : "neutral"} />
        <Stat label="ارزش خرید" value={<Money rial={r.suppliers.reduce((s, x) => s + x.value, 0)} />} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader title="عملکرد تأمین‌کنندگان" />
        <Table>
          <THead><tr><TH>تأمین‌کننده</TH><TH className="text-end">سفارش</TH><TH className="text-end">ارزش</TH><TH className="text-end">رسیده</TH><TH className="text-end">به‌موقع</TH><TH className="text-end">میانگین زمان تأمین</TH></tr></THead>
          <TBody>
            {r.suppliers.map((s) => (
              <TR key={s.name}>
                <TD className="font-bold">{s.name}</TD>
                <TD className="text-end tabular">{formatNumber(s.orders)}</TD>
                <TD className="text-end"><Money rial={s.value} /></TD>
                <TD className="text-end tabular">{formatNumber(s.received)}</TD>
                <TD className="text-end tabular">{s.received ? formatPercent((s.on_time / s.received) * 100, 0) : "—"}</TD>
                <TD className="text-end">{s.avg_days != null ? `${formatNumber(s.avg_days, { decimals: true })} روز` : "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {r.suppliers.length === 0 && <p className="px-5 pb-5 text-[13px] text-muted">سفارش خریدی در این بازه نیست.</p>}
      </Card>
    </>
  );
}
