"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Status } from "@/components/ui/status";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { REQUIREMENT_STATUS, UNIT } from "@/lib/labels";
import { formatNumber, toEnDigits } from "@/lib/persian";
import { useApiAction } from "../actions";

export interface RequirementView {
  id: string;
  material: { sku: string; name: string; unit: string };
  purpose: string;
  component: string | null;
  status: string;
  required: number;
  reserved: number;
  issued: number;
  consumed: number;
  wasted: number;
  returned: number;
}

const PURPOSE: Record<string, string> = { PAPER: "کاغذ", PLATE: "زینک", OPERATION: "ملزومات" };

export function MaterialsPanel({ reqs, perms, compact }: { reqs: RequirementView[]; perms: string[]; compact?: boolean }) {
  const can = (p: string) => perms.includes(p);
  const { run, pending } = useApiAction();
  const [issue, setIssue] = useState<RequirementView | null>(null);
  const [qty, setQty] = useState("");
  if (reqs.length === 0) return <p className="py-4 text-center text-[13px] text-muted">نیاز مواد پس از تأیید سفارش محاسبه می‌شود.</p>;
  return (
    <>
      <Table>
        <THead>
          <tr>
            <TH>ماده</TH>
            {!compact && <TH>کاربرد</TH>}
            <TH className="text-end">نیاز</TH>
            <TH className="text-end">رزرو</TH>
            <TH className="text-end">حواله</TH>
            <TH className="text-end">مصرف / ضایعات</TH>
            <TH>وضعیت</TH>
            <TH />
          </tr>
        </THead>
        <TBody>
          {reqs.map((r) => {
            const unit = UNIT[r.material.unit] ?? r.material.unit;
            const remaining = Math.max(0, r.required - r.issued);
            return (
              <TR key={r.id}>
                <TD><span className="font-bold">{r.material.name}</span><span className="block text-[11.5px] text-muted"><bdi dir="ltr">{r.material.sku}</bdi></span></TD>
                {!compact && <TD className="text-muted">{PURPOSE[r.purpose]}{r.component ? ` · ${r.component}` : ""}</TD>}
                <TD className="text-end tabular">{formatNumber(r.required, { decimals: true })} <span className="text-[11px] text-muted">{unit}</span></TD>
                <TD className="text-end tabular">{formatNumber(r.reserved, { decimals: true })}</TD>
                <TD className="text-end tabular">{formatNumber(r.issued, { decimals: true })}</TD>
                <TD className="text-end tabular">{formatNumber(r.consumed, { decimals: true })} / <span className={r.wasted ? "text-danger" : ""}>{formatNumber(r.wasted, { decimals: true })}</span></TD>
                <TD><Status map={REQUIREMENT_STATUS} value={r.status} /></TD>
                <TD className="text-end">
                  <div className="flex justify-end gap-1">
                    {can("inventory.reserve") && ["PENDING", "SHORTAGE", "PARTIALLY_RESERVED"].includes(r.status) && <Button size="xs" variant="secondary" loading={pending} onClick={() => run(() => api(`inventory/requirements/${r.id}/reserve`, { body: {} }), "رزرو انجام شد.")}>رزرو</Button>}
                    {can("inventory.issue") && r.status !== "RELEASED" && remaining > 0 && <Button size="xs" onClick={() => { setIssue(r); setQty(String(r.reserved || remaining)); }}>حواله</Button>}
                  </div>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <Dialog open={!!issue} onOpenChange={(o) => !o && setIssue(null)}>
        {issue && (
          <DialogContent
            title={`حواله ${issue.material.name}`}
            description={`رزرو شده: ${formatNumber(issue.reserved)} · باقیمانده نیاز: ${formatNumber(Math.max(0, issue.required - issue.issued))}. مقدار بیش از رزرو از موجودی آزاد کسر می‌شود.`}
            footer={<Button loading={pending} onClick={async () => { if (await run(() => api(`inventory/requirements/${issue.id}/issue`, { body: { quantity: Number(toEnDigits(qty)), idempotencyKey: newIdempotencyKey() } }), "حواله ثبت شد.")) setIssue(null); }}>ثبت حواله</Button>}
          >
            <Field label={`مقدار (${UNIT[issue.material.unit] ?? issue.material.unit})`}><Input ltr inputMode="decimal" value={qty} onChange={(e) => setQty(toEnDigits(e.target.value).replace(/[^\d.]/g, ""))} autoFocus /></Field>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
