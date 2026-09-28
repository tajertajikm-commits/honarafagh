"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";

/** Runs an API mutation with toast feedback and a server refresh. */
export function useApiAction() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, ok?: string, after?: (r: unknown) => void) =>
    new Promise<boolean>((resolve) =>
      start(async () => {
        try {
          const r = await fn();
          if (ok) toast.success(ok);
          after?.(r);
          router.refresh();
          resolve(true);
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "انجام عملیات ممکن نشد.");
          resolve(false);
        }
      }),
    );
  return { run, pending, toast, router };
}

/** One-click POST action. */
export function ActionButton({ path, body, success, children, confirm, ...props }: { path: string; body?: unknown; success?: string; confirm?: string; children: ReactNode } & Omit<ButtonProps, "onClick">) {
  const { run, pending } = useApiAction();
  return (
    <Button
      {...props}
      loading={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        void run(() => api(path, { body: body ?? {} }), success);
      }}
    >
      {children}
    </Button>
  );
}

/** Action that requires a written reason (audited overrides, cancellations …). */
export function ReasonAction({ path, title, description, label = "دلیل", success, children, extraBody, variant = "secondary", size = "sm", confirmLabel = "تأیید", danger, bodyKey = "reason" }: {
  path: string;
  title: string;
  description?: string;
  label?: string;
  success?: string;
  children: ReactNode;
  extraBody?: Record<string, unknown>;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  confirmLabel?: string;
  danger?: boolean;
  /** Body field that carries the text (default "reason"). */
  bodyKey?: string;
}) {
  const { run, pending } = useApiAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} size={size}>{children}</Button>
      </DialogTrigger>
      <DialogContent
        title={title}
        description={description}
        footer={
          <Button variant={danger ? "danger" : "primary"} loading={pending} disabled={reason.trim().length < 2} onClick={async () => { if (await run(() => api(path, { body: { [bodyKey]: reason, ...extraBody } }), success)) { setOpen(false); setReason(""); } }}>
            {confirmLabel}
          </Button>
        }
      >
        <Field label={label}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>
        <p className="mt-2 text-[12px] text-muted">این عملیات با نام شما در گزارش ممیزی ثبت می‌شود.</p>
      </DialogContent>
    </Dialog>
  );
}
