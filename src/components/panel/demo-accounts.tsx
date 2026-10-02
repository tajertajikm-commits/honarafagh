"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogIn } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/cn";

export interface DemoAccount { phone: string; name: string; title: string }

/** Demo mode only: one click signs in as that person. */
export function DemoAccounts({ accounts, password, compact }: { accounts: DemoAccount[]; password: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const login = async (phone: string) => {
    setBusy(phone);
    setError(null);
    try {
      await api("staff/auth/login", { body: { phone, password } });
      router.replace("/panel");
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "ورود ناموفق بود.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <ul className={cn("grid gap-1.5", !compact && "mt-3")}>
        {accounts.map((a) => (
          <li key={a.phone}>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => void login(a.phone)}
              className={cn("flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-start transition-colors hover:border-line-strong hover:bg-surface-2 disabled:opacity-60", busy === a.phone && "border-ink")}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold text-ink">{a.name}</span>
                <span className="block text-[12px] text-muted">{a.title}</span>
              </span>
              <bdi dir="ltr" className="shrink-0 text-[12px] tabular text-muted">{a.phone}</bdi>
              <LogIn className="size-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </>
  );
}
