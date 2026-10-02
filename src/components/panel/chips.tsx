import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

/** Digital (blue) and Offset (orange) are told apart at a glance everywhere. */
export function TypeChip({ type, className }: { type: "DIGITAL" | "OFFSET" | string; className?: string }) {
  return type === "OFFSET" ? (
    <Badge tone="accent" className={className}>افست</Badge>
  ) : (
    <Badge tone="info" className={className}>دیجیتال</Badge>
  );
}

export function PriorityFlag({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full bg-danger-soft px-2 text-[12px] font-bold text-danger ring-1 ring-inset ring-danger/15", className)} title="اولویت در صف">
      <Flame className="size-3.5" />
      {!compact && "اولویت"}
    </span>
  );
}
