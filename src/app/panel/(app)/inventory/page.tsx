import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/panel/page";
import { MaterialDialog, StockDialog } from "@/components/panel/inventory-forms";
import { requireStaffPage } from "@/server/http/session";
import { listMaterials, MATERIAL_CATEGORIES, type MaterialCategory } from "@/server/modules/materials/service";
import { UNIT } from "@/lib/labels";
import { formatNumber } from "@/lib/persian";

export const metadata: Metadata = { title: "مواد و انبار" };

/** Paper, cardboard, film, UV, binding, plates and packaging — what is on the shelf. */
export default async function InventoryPage() {
  const ctx = await requireStaffPage({ permission: "inventory.manage" });
  const rows = await listMaterials(ctx, { activeOnly: false });
  const low = rows.filter((m) => m.isActive && m.stock <= m.minStock);
  const cats = (Object.keys(MATERIAL_CATEGORIES) as MaterialCategory[]).filter((c) => rows.some((m) => m.category === c));
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="مواد و انبار" description="مصرف کاغذ دیجیتال هنگام انتخاب کاغذ در تولید خودکار کم می‌شود." actions={<MaterialDialog />} />
      {low.length > 0 && (
        <p className="rounded-2xl border border-warning/30 bg-warning-soft/60 px-5 py-3 text-[13.5px]">
          <b>زیر حداقل موجودی:</b> {low.map((m) => m.name).join("، ")}
        </p>
      )}
      {cats.map((c) => (
        <section key={c} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <h2 className="border-b border-line px-5 py-3 text-[15px] font-bold">{MATERIAL_CATEGORIES[c]}</h2>
          <Table>
            <THead><TR><TH>کد</TH><TH>نام</TH><TH className="text-end">موجودی</TH><TH className="text-end">حداقل</TH><TH className="text-end">قیمت واحد</TH><TH /></TR></THead>
            <TBody>
              {rows.filter((m) => m.category === c).map((m) => (
                <TR key={m.id} className={!m.isActive ? "opacity-50" : undefined}>
                  <TD><bdi dir="ltr" className="text-[12.5px] text-muted">{m.sku}</bdi></TD>
                  <TD className="font-bold">{m.name}</TD>
                  <TD className="text-end tabular">
                    <span className={m.stock <= m.minStock ? "font-bold text-danger" : ""}>{formatNumber(m.stock)}</span> <span className="text-[12px] text-muted">{UNIT[m.unit] ?? m.unit}</span>
                    {m.stock <= m.minStock && <Badge tone="danger" className="ms-2">کم</Badge>}
                  </TD>
                  <TD className="text-end tabular text-muted">{formatNumber(m.minStock)}</TD>
                  <TD className="text-end"><Money rial={m.standardCost} /></TD>
                  <TD className="text-end"><StockDialog materialId={m.id} name={m.name} unit={UNIT[m.unit] ?? m.unit} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ))}
    </div>
  );
}
