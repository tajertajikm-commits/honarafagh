import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatNumber, formatRelative, formatToman, toFaDigits } from "@/lib/persian";

/** Money is stored in rial and shown in toman with tabular digits. */
export function Money({ rial, className, unit = true, strong }: { rial: number | null | undefined; className?: string; unit?: boolean; strong?: boolean }) {
  if (rial == null) return <span className={cn("text-subtle", className)}>—</span>;
  return (
    <span className={cn("tabular whitespace-nowrap", strong && "font-bold", className)}>
      {formatToman(rial, { unit: false })}
      {unit && <span className="ms-1 text-[0.82em] font-medium text-muted">تومان</span>}
    </span>
  );
}

export function Num({ value, className, decimals }: { value: number | null | undefined; className?: string; decimals?: boolean }) {
  return <span className={cn("tabular", className)}>{value == null ? "—" : formatNumber(value, { decimals })}</span>;
}

/** Latin identifiers (phone numbers, SKUs, tracking codes) isolated as LTR. */
export function Code({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi className={cn("ltr tabular font-medium", className)} dir="ltr">{children}</bdi>;
}

export function OrderNo({ n, className }: { n: number; className?: string }) {
  return <span className={cn("tabular font-bold", className)}>#{toFaDigits(n)}</span>;
}

export function DateText({ value, withTime, relative, className }: { value: Date | string | null | undefined; withTime?: boolean; relative?: boolean; className?: string }) {
  if (!value) return <span className={cn("text-subtle", className)}>—</span>;
  const d = new Date(value);
  return (
    <time dateTime={d.toISOString()} title={formatDateTime(d)} className={cn("whitespace-nowrap", className)}>
      {relative ? formatRelative(d) : withTime ? formatDateTime(d) : formatDate(d)}
    </time>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon && <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted [&_svg]:size-6">{icon}</div>}
      <p className="text-[15px] font-bold">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13.5px] leading-6 text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1 text-[11px] font-medium text-muted">{children}</kbd>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function SectionTitle({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-[18px] font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-[13.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Four-ink segmented progress — the brand's signature progress motif. */
export function InkProgress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="brand-spectrum-rtl absolute inset-y-0 right-0 rounded-full transition-[width] duration-500" style={{ width: `${v * 100}%` }} />
    </div>
  );
}
