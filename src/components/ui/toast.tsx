"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Toast = { id: number; tone: "success" | "error" | "info"; message: string };
const Ctx = createContext<{ push: (t: Omit<Toast, "id">) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.tone === "error" ? 7000 : 4000);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md animate-rise items-start gap-3 rounded-xl border px-4 py-3 text-[14px] shadow-float",
              t.tone === "error" ? "border-danger/20 bg-surface text-ink" : "border-line bg-ink text-surface",
            )}
          >
            {t.tone === "error" ? <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-brand-amber" />}
            <p className="flex-1 leading-6">{t.message}</p>
            <button className="opacity-60 hover:opacity-100" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} aria-label="بستن">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast outside ToastProvider");
  return {
    success: (message: string) => ctx.push({ tone: "success", message }),
    error: (message: string) => ctx.push({ tone: "error", message }),
    info: (message: string) => ctx.push({ tone: "info", message }),
  };
}
