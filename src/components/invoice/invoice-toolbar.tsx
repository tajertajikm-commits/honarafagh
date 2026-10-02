"use client";

import Link from "next/link";
import { ArrowRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonAction } from "@/components/panel/actions";

/** Print / Save-as-PDF: the browser produces a vector PDF with real, selectable Persian text. */
export function InvoiceToolbar({ backHref, backLabel, invoiceId, canVoid }: { backHref: string; backLabel: string; invoiceId?: string; canVoid?: boolean }) {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href={backHref}><ArrowRight className="size-4" /> {backLabel}</Link>
      </Button>
      <div className="ms-auto flex items-center gap-2">
        {canVoid && invoiceId && (
          <ReasonAction path={`invoices/${invoiceId}/void`} title="ابطال فاکتور" description="فاکتور باطل می‌شود و می‌توانید فاکتور جدید صادر کنید." success="فاکتور باطل شد." variant="danger-ghost" danger confirmLabel="ابطال">
            ابطال
          </ReasonAction>
        )}
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> دانلود PDF / چاپ
        </Button>
      </div>
      <p className="w-full text-end text-[11.5px] text-muted">برای PDF، در پنجره چاپ مقصد «Save as PDF / ذخیره به‌صورت PDF» را انتخاب کنید.</p>
    </div>
  );
}
