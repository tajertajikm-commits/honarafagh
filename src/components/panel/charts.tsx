"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/persian";

/**
 * Single-series charts (one hue, magnitude). Thin marks, 4px rounded data
 * ends anchored to the baseline, values in text tokens, a per-mark hover and
 * focus tooltip, and every value also reachable without hovering (tip labels
 * on bar lists, table toggle on columns).
 */

export interface Datum {
  label: string;
  value: number;
  /** Pre-formatted value for labels/tooltips. */
  display?: string;
  hint?: string;
  tone?: "series" | "danger" | "warning";
}

const fill = { series: "var(--color-series)", danger: "var(--color-danger)", warning: "var(--color-brand-amber)" };

export function BarList({ data, max, className, empty = "داده‌ای نیست." }: { data: Datum[]; max?: number; className?: string; empty?: string }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="py-6 text-center text-[13px] text-muted">{empty}</p>;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {data.map((d) => {
        const pct = Math.max(d.value > 0 ? 2 : 0, Math.min(100, (d.value / top) * 100));
        return (
          <li key={d.label} className="group" title={`${d.label}: ${d.display ?? formatNumber(d.value)}${d.hint ? ` — ${d.hint}` : ""}`} tabIndex={0}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="truncate font-bold text-ink-2">{d.label}</span>
              <span className="shrink-0 tabular text-ink">{d.display ?? formatNumber(d.value)}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full transition-[width,filter] duration-500 group-hover:brightness-110 group-focus:brightness-110" style={{ width: `${pct}%`, background: fill[d.tone ?? "series"] }} />
            </div>
            {d.hint && <p className="mt-0.5 text-[11.5px] text-muted">{d.hint}</p>}
          </li>
        );
      })}
    </ul>
  );
}

function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1]! < max) ticks.push(ticks[ticks.length - 1]! + step);
  return ticks;
}

export function ColumnChart({ data, height = 200, format = (n: number) => formatNumber(n), title }: { data: Datum[]; height?: number; format?: (n: number) => string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.value)));
  const top = ticks[ticks.length - 1] || 1;
  const labelEvery = Math.ceil(data.length / 8);

  if (table) {
    return (
      <div>
        <button className="mb-2 text-[12px] font-bold text-accent-ink" onClick={() => setTable(false)}>نمایش نمودار</button>
        <table className="w-full text-[12.5px]">
          <tbody>
            {data.map((d) => (
              <tr key={d.label} className="border-b border-line">
                <td className="py-1.5 text-muted">{d.label}</td>
                <td className="py-1.5 text-end tabular">{d.display ?? format(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <figure aria-label={title}>
      <div className="relative flex gap-2" style={{ height }}>
        {/* y axis (right side in RTL) */}
        <div className="relative w-14 shrink-0 text-[11px] text-subtle">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 tabular" style={{ bottom: `${(t / top) * 100}%`, transform: "translateY(50%)" }}>
              {format(t)}
            </span>
          ))}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 h-px bg-line" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" onMouseLeave={() => setHover(null)}>
            {data.map((d, i) => (
              <button
                key={d.label}
                className="group relative flex h-full flex-1 items-end justify-center focus:outline-none"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                aria-label={`${d.label}: ${d.display ?? format(d.value)}`}
              >
                <span
                  className="w-full max-w-6 rounded-t-[4px] transition-[filter]"
                  style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 2 : 0, background: fill[d.tone ?? "series"], filter: hover === i ? "brightness(1.12)" : undefined }}
                />
              </button>
            ))}
          </div>
          {hover != null && data[hover] && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-float"
              style={{ left: `${100 - ((hover + 0.5) / data.length) * 100}%`, bottom: `calc(${(data[hover]!.value / top) * 100}% + 8px)` }}
            >
              <p className="font-bold tabular text-ink">{data[hover]!.display ?? format(data[hover]!.value)}</p>
              <p className="whitespace-nowrap text-muted">{data[hover]!.label}</p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2">
        <div className="w-14 shrink-0" />
        <div className="flex h-4 flex-1 gap-[2px] text-[10.5px] text-subtle">
          {data.map((d, i) => (
            <span key={d.label} className="relative flex-1">
              {i % labelEvery === 0 && <span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap">{d.label}</span>}
            </span>
          ))}
        </div>
      </div>
      <button className="mt-2 text-[11.5px] text-muted hover:text-ink" onClick={() => setTable(true)}>نمایش جدول</button>
    </figure>
  );
}
