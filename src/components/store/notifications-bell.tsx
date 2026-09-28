"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatRelative, toFaDigits } from "@/lib/persian";

interface Notice { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

/** Customer in-app notifications (order placed, payment, production, ready, delivery …). */
export function NotificationsBell() {
  const [inbox, setInbox] = useState<{ items: Notice[]; unread: number }>({ items: [], unread: 0 });
  useEffect(() => {
    let alive = true;
    const load = () => api<{ items: Notice[]; unread: number }>("notifications").then((d) => alive && setInbox(d)).catch(() => undefined);
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <Popover.Root onOpenChange={(o) => { if (!o && inbox.unread) void api("notifications/read", { body: {} }).then(() => setInbox((x) => ({ ...x, unread: 0 }))); }}>
      <Popover.Trigger className="relative grid size-10 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={`اعلان‌ها${inbox.unread ? ` (${inbox.unread} خوانده‌نشده)` : ""}`}>
        <Bell className="size-[19px]" />
        {inbox.unread > 0 && <span className="absolute -top-0.5 -left-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-red px-1 text-[11px] font-bold text-white tabular">{toFaDigits(Math.min(99, inbox.unread))}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} dir="rtl" className="z-50 w-[min(360px,calc(100vw-24px))] animate-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
          <div className="border-b border-line px-4 py-3 text-[14px] font-bold">اعلان‌ها</div>
          <ul className="scrollbar-thin max-h-[420px] overflow-y-auto">
            {inbox.items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">اعلانی نیست.</li>}
            {inbox.items.map((n) => (
              <li key={n.id} className={cn("border-b border-line last:border-0", !n.readAt && "bg-accent-soft/40")}>
                <Link href={n.link || "/account"} className="block px-4 py-3 hover:bg-surface-2">
                  <p className="text-[13px] font-bold">{n.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-6 text-ink-2">{n.body}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{formatRelative(n.createdAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
