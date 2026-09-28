import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Tone } from "@/lib/labels";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 ring-line",
  info: "bg-info-soft text-info ring-info/15",
  success: "bg-success-soft text-success ring-success/15",
  warning: "bg-warning-soft text-warning ring-warning/20",
  danger: "bg-danger-soft text-danger ring-danger/15",
  accent: "bg-accent-soft text-accent-ink ring-accent/20",
  violet: "bg-violet-soft text-violet ring-violet/15",
};

const dots: Record<Tone, string> = {
  neutral: "bg-subtle",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  accent: "bg-accent",
  violet: "bg-violet",
};

export function Badge({ tone = "neutral", children, className, dot, pulse }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; pulse?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-bold ring-1 ring-inset", tones[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone], pulse && "pulse-dot")} />}
      {children}
    </span>
  );
}
