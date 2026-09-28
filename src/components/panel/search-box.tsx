"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

/** URL-driven search input (debounced), keeps other query params. */
export function SearchBox({ placeholder, param = "q" }: { placeholder: string; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [v, setV] = useState(params.get(param) ?? "");
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      if (v) p.set(param, v);
      else p.delete(param);
      p.delete("page");
      const next = `${path}?${p.toString()}`;
      if (next !== `${path}?${params.toString()}`) router.replace(next);
    }, 300);
    return () => clearTimeout(t);
  }, [v, param, path, params, router]);
  return (
    <label className="relative block w-full max-w-xs">
      <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-9 w-full rounded-lg border border-line-strong bg-surface pe-3 ps-9 text-[13px] shadow-soft outline-none focus:border-ink" />
    </label>
  );
}
