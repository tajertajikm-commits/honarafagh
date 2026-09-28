import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/labels";

export function PageHeader({ title, description, actions, crumbs }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { href: string; label: string }[] }) {
  return (
    <div className="mb-6">
      {crumbs && (
        <nav className="mb-2 flex items-center gap-1 text-[12.5px] text-muted">
          {crumbs.map((c) => (
            <span key={c.href} className="flex items-center gap-1">
              <Link href={c.href} className="hover:text-ink">{c.label}</Link>
              <ChevronLeft className="size-3.5" />
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-snug">{title}</h1>
          {description && <p className="mt-1 text-[13.5px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const toneRing: Record<Tone, string> = {
  neutral: "",
  info: "before:bg-info",
  success: "before:bg-success",
  warning: "before:bg-brand-amber",
  danger: "before:bg-danger",
  accent: "before:bg-accent",
  violet: "before:bg-violet",
};

export function Stat({ label, value, sub, tone = "neutral", href, icon }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: Tone; href?: string; icon?: ReactNode }) {
  const body = (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-xl border border-line bg-surface px-4 py-3.5 shadow-soft transition-colors",
        tone !== "neutral" && "before:absolute before:inset-y-3 before:right-0 before:w-[3px] before:rounded-full",
        toneRing[tone],
        href && "hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-bold text-muted">{label}</p>
        {icon && <span className="text-subtle [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-1 text-[24px] font-bold leading-tight tabular">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function FilterTabs({ tabs, active }: { tabs: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="scrollbar-thin -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold transition-colors",
            active === t.key ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2",
          )}
        >
          {t.label}
          {t.count != null && <span className={cn("rounded-full px-1.5 text-[11px] tabular", active === t.key ? "bg-surface/20" : "bg-surface-2 text-muted")}>{new Intl.NumberFormat("fa-IR").format(t.count)}</span>}
        </Link>
      ))}
    </div>
  );
}

export function KV({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-1.5 text-[13px]", className)}>
      <span className="text-muted">{label}</span>
      <span className="text-end font-medium">{children}</span>
    </div>
  );
}
