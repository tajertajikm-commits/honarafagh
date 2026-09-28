"use client";

import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { Boxes, Loader2, Package, Receipt, Search, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { useDebouncedFetch } from "@/lib/use-debounced-fetch";
import { toFaDigits } from "@/lib/persian";

interface Hit { kind: "order" | "customer" | "product" | "employee" | "material"; id: string; title: string; subtitle: string; href: string }
const ICON = { order: Receipt, customer: Users, product: Package, employee: UserRound, material: Boxes };
const KIND = { order: "سفارش", customer: "مشتری", product: "محصول", employee: "کارمند", material: "کالا" };

export function CommandSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [activeRaw, setActive] = useState(0);
  const term = q.trim().length >= 2 ? q.trim() : null;
  const search = useDebouncedFetch<Hit[]>(term, (signal) => api<Hit[]>(`search?q=${encodeURIComponent(term ?? "")}`, { signal }), 180);
  const hits = term ? (search.data ?? []) : [];
  const loading = search.loading;
  const active = Math.min(activeRaw, Math.max(0, hits.length - 1));

  const go = (h: Hit) => {
    onOpenChange(false);
    setQ("");
    router.push(h.href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content dir="rtl" className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 animate-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
          <Dialog.Title className="sr-only">جستجو</Dialog.Title>
          <Dialog.Description className="sr-only">جستجوی سراسری</Dialog.Description>
          <div className="flex items-center gap-3 border-b border-line px-4">
            {loading ? <Loader2 className="size-5 animate-spin text-muted" /> : <Search className="size-5 text-muted" />}
            <input
              autoFocus
              value={q}
              onChange={(e) => { setQ(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") setActive((a) => Math.min(hits.length - 1, a + 1));
                if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
                if (e.key === "Enter" && hits[active]) go(hits[active]);
              }}
              placeholder="شماره سفارش، نام یا موبایل مشتری، محصول، کالا، کارمند…"
              className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
              aria-label="جستجو"
            />
          </div>
          <ul className="scrollbar-thin max-h-[50vh] overflow-y-auto p-2">
            {q.trim().length >= 2 && !loading && hits.length === 0 && <li className="px-3 py-8 text-center text-[13px] text-muted">نتیجه‌ای پیدا نشد.</li>}
            {q.trim().length < 2 && <li className="px-3 py-6 text-center text-[13px] text-muted">حداقل دو حرف بنویسید. اعداد فارسی و انگلیسی هر دو پذیرفته می‌شوند.</li>}
            {hits.map((h, i) => {
              const Icon = ICON[h.kind];
              return (
                <li key={`${h.kind}-${h.id}`}>
                  <button onMouseEnter={() => setActive(i)} onClick={() => go(h)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start", i === active && "bg-surface-2")}>
                    <span className="grid size-8 place-items-center rounded-md bg-surface-2 text-ink-2"><Icon className="size-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold">{toFaDigits(h.title)}</span>
                      <span className="block truncate text-[12px] text-muted" dir="auto">{h.subtitle}</span>
                    </span>
                    <span className="text-[11.5px] text-subtle">{KIND[h.kind]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
