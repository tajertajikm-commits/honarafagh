import type { Metadata } from "next";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { InvoiceToolbar } from "@/components/invoice/invoice-toolbar";
import { can } from "@/server/core/context";
import { requireStaffPage } from "@/server/http/session";
import { getInvoice } from "@/server/modules/finance/invoices";

export const metadata: Metadata = { title: "فاکتور" };

export default async function StaffInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStaffPage({ anyOf: ["invoice.manage", "payment.view"] });
  const inv = await getInvoice(ctx, (await params).id);
  return (
    <div className="min-h-dvh bg-canvas px-4 py-6 print:bg-white print:p-0">
      <InvoiceToolbar backHref={`/panel/orders/${inv.snapshot.orderCode}?tab=finance`} backLabel={`بازگشت به سفارش ${inv.snapshot.orderCode}`} invoiceId={inv.id} canVoid={can(ctx, "invoice.manage") && inv.status === "ISSUED"} />
      <InvoiceDocument number={inv.number} type={inv.type} issuedAt={inv.issuedAt} snapshot={inv.snapshot} notes={inv.notes} voided={inv.status === "VOID"} />
    </div>
  );
}
