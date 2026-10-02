import type { Metadata } from "next";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageHeader } from "@/components/panel/page";
import { SupplierDialog } from "@/components/panel/inventory-forms";
import { can } from "@/server/core/context";
import { requireStaffPage } from "@/server/http/session";
import { listSuppliers } from "@/server/modules/offset/service";

export const metadata: Metadata = { title: "تأمین‌کنندگان" };

const KIND: Record<string, string> = { PAPER: "کاغذ", LITHO: "لیتوگرافی", OTHER: "سایر" };

export default async function SuppliersPage() {
  const ctx = await requireStaffPage({ anyOf: ["offset.paper", "offset.litho", "inventory.manage"] });
  const rows = await listSuppliers(ctx);
  const kinds = ([["PAPER", "کاغذ"], ["LITHO", "لیتوگرافی"], ["OTHER", "سایر"]] as [string, string][]).filter(([k]) => (k === "PAPER" ? can(ctx, "offset.paper") : k === "LITHO" ? can(ctx, "offset.litho") : can(ctx, "inventory.manage")));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="تأمین‌کنندگان" description="فروشندگان کاغذ (برای استعلام قیمت) و لیتوگرافی‌های طرف قرارداد." actions={kinds.length ? <SupplierDialog kinds={kinds} /> : undefined} />
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <Table>
          <THead><TR><TH>نام</TH><TH>نوع</TH><TH>طرف تماس</TH><TH>تلفن</TH><TH>توضیح</TH><TH /></TR></THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-bold">{s.name}</TD>
                <TD>{KIND[s.kind]}</TD>
                <TD>{s.contactName ?? "—"}</TD>
                <TD>{s.phone ? <bdi dir="ltr">{s.phone}</bdi> : "—"}</TD>
                <TD className="text-[12.5px] text-muted">{s.notes ?? ""}</TD>
                <TD>{kinds.some(([k]) => k === s.kind) && <SupplierDialog supplier={s} kinds={kinds} />}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
