"use client";

import { DropdownMenu } from "radix-ui";
import { ChevronDown, Flag, PauseCircle, PlayCircle, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { ORDER_STATUS, PRIORITY } from "@/lib/labels";
import { toEnDigits } from "@/lib/persian";
import { ActionButton, useApiAction } from "../actions";

type Mode = null | "hold" | "cancel" | "discount" | "deposit" | "force" | "priority";

export function OrderHeaderActions({ order, perms }: { order: { id: string; status: string; priority: string; discountAmount: number; depositPct: number; paymentGateOverride: boolean }; perms: string[] }) {
  const can = (p: string) => perms.includes(p);
  const { run, pending } = useApiAction();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState("");
  const [value, setValue] = useState("");
  const close = () => { setMode(null); setReason(""); setValue(""); };
  const submit = async (path: string, body: Record<string, unknown>, ok: string) => { if (await run(() => api(path, { body }), ok)) close(); };
  const closed = ["CANCELLED", "COMPLETED"].includes(order.status);

  return (
    <>
      {order.status === "PENDING_REVIEW" && can("order.edit") && (
        <ActionButton path={`orders/${order.id}/confirm`} success="سفارش تأیید شد؛ مواد رزرو و گردش‌کار تولید آغاز شد." size="sm">تأیید و آزادسازی تولید</ActionButton>
      )}
      {order.status === "ON_HOLD" && can("order.edit") && <ActionButton path={`orders/${order.id}/resume`} success="سفارش از توقف خارج شد." size="sm" variant="secondary"><PlayCircle /> ادامه</ActionButton>}
      <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer /> چاپ برگه</Button>
      {!closed && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild><Button size="sm" variant="secondary">عملیات <ChevronDown /></Button></DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-56 animate-rise rounded-xl border border-line bg-surface p-1.5 shadow-float">
              {[
                can("order.priority.change") && { m: "priority" as const, l: "تغییر اولویت" },
                can("order.edit") && order.status !== "ON_HOLD" && { m: "hold" as const, l: "توقف سفارش" },
                can("order.price.override") && { m: "discount" as const, l: "تخفیف سفارش" },
                can("order.state.force") && { m: "deposit" as const, l: "پیش‌پرداخت / عبور از شرط پرداخت" },
                can("order.state.force") && { m: "force" as const, l: "تغییر اجباری وضعیت" },
                can("order.cancel") && { m: "cancel" as const, l: "لغو سفارش", danger: true },
              ]
                .filter(Boolean)
                .map((x) => {
                  const it = x as { m: Mode; l: string; danger?: boolean };
                  return (
                    <DropdownMenu.Item key={it.m} onSelect={() => { setMode(it.m); setValue(it.m === "priority" ? order.priority : it.m === "discount" ? String(order.discountAmount / 10) : it.m === "deposit" ? String(order.depositPct) : ""); }} className={`flex h-9 cursor-pointer items-center rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-surface-2 ${it.danger ? "text-danger" : ""}`}>
                      {it.l}
                    </DropdownMenu.Item>
                  );
                })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        {mode === "priority" && (
          <DialogContent title="تغییر اولویت" footer={<Button loading={pending} onClick={() => submit(`orders/${order.id}/priority`, { priority: value, reason: reason || undefined }, "اولویت تغییر کرد.")}><Flag /> ذخیره</Button>}>
            <div className="space-y-4">
              <Field label="اولویت"><Select value={value} onChange={(e) => setValue(e.target.value)}>{Object.entries(PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="توضیح (اختیاری)"><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
              <p className="text-[12px] text-muted">اولویت همه مراحل باز تولید این سفارش به‌روز می‌شود.</p>
            </div>
          </DialogContent>
        )}
        {mode === "hold" && (
          <DialogContent title="توقف سفارش" description="مراحل تولید تا ادامه سفارش قابل شروع نیستند." footer={<Button variant="danger" loading={pending} disabled={reason.trim().length < 2} onClick={() => submit(`orders/${order.id}/hold`, { reason }, "سفارش متوقف شد.")}><PauseCircle /> توقف</Button>}>
            <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </DialogContent>
        )}
        {mode === "cancel" && (
          <DialogContent title="لغو سفارش" description="رزرو مواد آزاد و مراحل تولید لغو می‌شوند. اگر تولید شروع شده باشد، فقط مدیر مجاز است؛ مواد حواله‌شده باید برگشت یا ضایعات ثبت شوند." footer={<Button variant="danger" loading={pending} disabled={reason.trim().length < 2} onClick={() => submit(`orders/${order.id}/cancel`, { reason }, "سفارش لغو شد.")}>لغو سفارش</Button>}>
            <Field label="دلیل لغو"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          </DialogContent>
        )}
        {mode === "discount" && (
          <DialogContent title="تخفیف سفارش" footer={<Button loading={pending} disabled={reason.trim().length < 2} onClick={() => submit(`orders/${order.id}/discount`, { discount: Number(toEnDigits(value) || 0) * 10, reason }, "تخفیف اعمال شد.")}>اعمال</Button>}>
            <div className="space-y-4">
              <Field label="مبلغ تخفیف (تومان)"><Input ltr inputMode="numeric" value={value} onChange={(e) => setValue(toEnDigits(e.target.value).replace(/\D/g, ""))} /></Field>
              <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </div>
          </DialogContent>
        )}
        {mode === "deposit" && (
          <DialogContent title="شرط پیش‌پرداخت" description="زینک‌سازی و چاپ تا دریافت پیش‌پرداخت منتظر می‌مانند. مدیر می‌تواند درصد را تغییر دهد یا شرط را برای مشتری معتبر برداشته و ثبت کند." footer={
            <>
              <Button variant="secondary" loading={pending} disabled={reason.trim().length < 2} onClick={() => submit(`orders/${order.id}/deposit`, { override: false, depositPct: Number(value || 0), reason }, "درصد پیش‌پرداخت ذخیره شد.")}>ذخیره درصد</Button>
              <Button loading={pending} disabled={reason.trim().length < 2} onClick={() => submit(`orders/${order.id}/deposit`, { override: !order.paymentGateOverride, reason }, order.paymentGateOverride ? "شرط پرداخت بازگردانده شد." : "شرط پرداخت برداشته شد.")}>{order.paymentGateOverride ? "بازگرداندن شرط" : "عبور از شرط پرداخت"}</Button>
            </>
          }>
            <div className="space-y-4">
              <Field label="درصد پیش‌پرداخت"><Input ltr inputMode="numeric" value={value} onChange={(e) => setValue(toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 3))} /></Field>
              <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </div>
          </DialogContent>
        )}
        {mode === "force" && (
          <DialogContent title="تغییر اجباری وضعیت" description="فقط برای اصلاح داده‌ها؛ وضعیت‌ها معمولاً به‌صورت خودکار از تولید، پرداخت و ارسال محاسبه می‌شوند." footer={<Button variant="danger" loading={pending} disabled={!value || reason.trim().length < 2} onClick={() => submit(`orders/${order.id}/force-status`, { status: value, reason }, "وضعیت تغییر کرد.")}>اعمال</Button>}>
            <div className="space-y-4">
              <Field label="وضعیت جدید"><Select value={value} onChange={(e) => setValue(e.target.value)}><option value="">انتخاب…</option>{["PENDING_REVIEW", "CONFIRMED", "IN_PROGRESS", "ON_HOLD", "READY", "COMPLETED"].map((k) => <option key={k} value={k}>{ORDER_STATUS[k]![0]}</option>)}</Select></Field>
              <Field label="دلیل"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
