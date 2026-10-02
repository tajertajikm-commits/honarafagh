import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { InvoiceToolbar } from "@/components/invoice/invoice-toolbar";
import { isAppError } from "@/server/core/errors";
import { requireCustomerPage } from "@/server/http/session";
import { getInvoice } from "@/server/modules/finance/invoices";

export const metadata: Metadata = { title: "فاکتور" };

export default async function CustomerInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCustomerPage(`/account/invoices/${id}`);
  let inv;
  try {
    inv = await getInvoice(ctx, id);
  } catch (err) {
    if (isAppError(err) && err.code === "NOT_FOUND") notFound();
    throw err;
  }
  return (
    <div className="py-2">
      <InvoiceToolbar backHref={`/account/orders/${inv.orderId}`} backLabel="بازگشت به سفارش" />
      <InvoiceDocument number={inv.number} type={inv.type} issuedAt={inv.issuedAt} snapshot={inv.snapshot} notes={inv.notes} voided={inv.status === "VOID"} />
    </div>
  );
}
