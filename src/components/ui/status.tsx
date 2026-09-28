import { Badge } from "./badge";
import { label, tone } from "@/lib/labels";

type Map_ = Parameters<typeof label>[0];

/** Renders a state-domain value as a labelled, toned pill. */
export function Status({ map, value, className }: { map: Map_; value: string | null | undefined; className?: string }) {
  const t = tone(map, value);
  return (
    <Badge tone={t} dot pulse={t === "accent"} className={className}>
      {label(map, value)}
    </Badge>
  );
}
