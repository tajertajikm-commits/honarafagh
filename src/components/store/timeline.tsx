import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/persian";

export interface TimelineStepView {
  key: string;
  label: string;
  state: "done" | "current" | "upcoming" | "skipped";
  at?: Date | string | null;
}

const INKS = ["#FFF301", "#FDB913", "#F26422", "#ED1D26"];

/** Customer progress line: ✓ done · ● current · ○ upcoming. */
export function OrderTimeline({ steps, className }: { steps: TimelineStepView[]; className?: string }) {
  const doneCount = steps.filter((s) => s.state === "done").length;
  return (
    <ol className={cn("relative grid gap-0", className)} aria-label="مراحل سفارش">
      {steps.map((s, i) => {
        const ink = INKS[Math.min(INKS.length - 1, Math.floor((i / Math.max(1, steps.length - 1)) * INKS.length))];
        return (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {i < steps.length - 1 && <span className={cn("absolute right-[13px] top-7 h-[calc(100%-20px)] w-0.5 rounded", i < doneCount - 1 || (i < doneCount && steps[i + 1]?.state !== "upcoming") ? "bg-ink/80" : "bg-line")} />}
            <span
              className={cn(
                "relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border-2 text-[12px]",
                s.state === "done" && "border-transparent text-ink",
                s.state === "current" && "border-ink bg-surface",
                s.state === "upcoming" && "border-line-strong bg-surface",
                s.state === "skipped" && "border-line bg-surface-2",
              )}
              style={s.state === "done" ? { background: ink } : undefined}
            >
              {s.state === "done" && <Check className="size-3.5" strokeWidth={3} />}
              {s.state === "current" && <span className="size-2.5 rounded-full bg-accent pulse-dot" />}
            </span>
            <div className="pt-0.5">
              <p className={cn("text-[14px] font-bold", s.state === "upcoming" && "text-muted", s.state === "skipped" && "text-subtle line-through")}>{s.label}</p>
              {s.state === "current" && <p className="text-[12px] text-accent-ink">در حال انجام</p>}
              {s.state === "done" && s.at && <p className="text-[12px] text-muted">{formatDate(s.at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
