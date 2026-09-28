"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { toEnDigits } from "@/lib/persian";
import { useApiAction } from "../actions";

export function PriceOverride({ itemId, current }: { itemId: string; current: number }) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(String(current / 10));
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>تغییر قیمت</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="تغییر دستی قیمت" description="مبلغ پیش از مالیات؛ جمع سفارش و مالیات دوباره محاسبه می‌شود. در گزارش ممیزی ثبت می‌شود." footer={<Button loading={pending} disabled={reason.trim().length < 2} onClick={async () => { if (await run(() => api(`order-items/${itemId}/price`, { body: { lineSubtotal: Number(toEnDigits(v) || 0) * 10, reason } }), "قیمت به‌روز شد.")) setOpen(false); }}>ذخیره</Button>}>
          <div className="space-y-4">
            <Field label="مبلغ جدید (تومان)"><Input ltr inputMode="numeric" value={v} onChange={(e) => setV(toEnDigits(e.target.value).replace(/\D/g, ""))} /></Field>
            <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ResolveChange({ id }: { id: string }) {
  const { run, pending } = useApiAction();
  const [text, setText] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <Textarea className="min-h-[52px] text-[12.5px]" placeholder="پاسخ به مشتری…" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <Button size="xs" loading={pending} disabled={text.trim().length < 2} onClick={() => run(() => api(`change-requests/${id}/resolve`, { body: { approve: true, resolution: text } }), "درخواست پذیرفته شد.")}>پذیرش</Button>
        <Button size="xs" variant="secondary" disabled={pending || text.trim().length < 2} onClick={() => run(() => api(`change-requests/${id}/resolve`, { body: { approve: false, resolution: text } }), "درخواست رد شد.")}>رد</Button>
      </div>
    </div>
  );
}
