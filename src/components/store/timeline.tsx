import { Check } from "lucide-react";
import { CUSTOMER_STAGES } from "@/lib/order-status";
import { cn } from "@/lib/cn";

const INKS = ["#FFF301", "#FDB913", "#FDB913", "#F26422", "#F26422", "#ED1D26"];

/**
 * The customer's six stages — never the internal workflow. Horizontal on
 * wide screens, vertical on phones.
 */
export function StatusStepper({ index, className }: { index: number; className?: string }) {
  return (
    <ol className={cn("grid gap-3 sm:grid-cols-6 sm:gap-0", className)} aria-label="وضعیت سفارش">
      {CUSTOMER_STAGES.map((s, i) => {
        const state = i < index ? "done" : i === index ? (i === CUSTOMER_STAGES.length - 1 ? "done" : "current") : "upcoming";
        return (
          <li key={s.key} className="relative flex items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
            {i < CUSTOMER_STAGES.length - 1 && <span className={cn("absolute hidden h-0.5 sm:block sm:top-3.5 sm:right-1/2 sm:w-full", i < index ? "bg-ink/80" : "bg-line")} />}
            <span
              className={cn(
                "relative z-[1] grid size-7 shrink-0 place-items-center rounded-full border-2",
                state === "done" && "border-transparent text-ink",
                state === "current" && "border-ink bg-surface",
                state === "upcoming" && "border-line-strong bg-surface",
              )}
              style={state === "done" ? { background: INKS[i] } : undefined}
            >
              {state === "done" && <Check className="size-3.5" strokeWidth={3} />}
              {state === "current" && <span className="size-2.5 rounded-full bg-accent pulse-dot" />}
            </span>
            <span className={cn("text-[13px] font-bold", state === "upcoming" && "text-muted", state === "current" && "text-ink")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
