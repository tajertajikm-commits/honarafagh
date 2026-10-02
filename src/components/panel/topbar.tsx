"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu, Popover } from "radix-ui";
import { Bell, LogOut, Menu, Search, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { ThemeSwitch } from "@/components/brand/theme";
import { Sheet } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import { formatRelative, toFaDigits } from "@/lib/persian";
import { CommandSearch } from "./command-search";
import type { NavItem } from "./nav";
import { Sidebar } from "./sidebar";

interface Notice { id: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }

export function Topbar({ user, sections, badges }: { user: { name: string; roles: string[] }; sections: { title: string; items: NavItem[] }[]; badges?: Record<string, number> }) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [inbox, setInbox] = useState<{ items: Notice[]; unread: number }>({ items: [], unread: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur-xl lg:px-8">
      <button className="grid size-9 place-items-center rounded-md text-ink-2 hover:bg-surface-2 lg:hidden" onClick={() => setNavOpen(true)} aria-label="منو">
        <Menu className="size-5" />
      </button>
      <Sheet open={navOpen} onOpenChange={setNavOpen} title="منو" width="max-w-[280px]">
        <div className="-mx-6 -my-5 h-[calc(100dvh-72px)]">
          <Sidebar sections={sections} badges={badges} onNavigate={() => setNavOpen(false)} />
        </div>
      </Sheet>

      <button onClick={() => setSearchOpen(true)} className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-lg border border-line bg-surface px-3 text-[13.5px] text-subtle shadow-soft transition-colors hover:border-line-strong">
        <Search className="size-4" />
        <span className="flex-1 text-start">کد سفارش (O-1042-0019)، کد مشتری (CUS-1042)، نام یا موبایل…</span>
        <span className="hidden items-center gap-1 sm:flex"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>
      <CommandSearch open={searchOpen} onOpenChange={setSearchOpen} />

      <div className="ms-auto flex items-center gap-1">
        <Popover.Root onOpenChange={(o) => { if (!o && inbox.unread) void api("notifications/read", { body: {} }).then(() => setInbox((x) => ({ ...x, unread: 0 }))); }}>
          <Popover.Trigger className="relative grid size-10 place-items-center rounded-md text-ink-2 hover:bg-surface-2" aria-label="اعلان‌ها">
            <Bell className="size-[19px]" />
            {inbox.unread > 0 && <span className="absolute left-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white">{toFaDigits(Math.min(99, inbox.unread))}</span>}
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={8} dir="rtl" className="z-50 w-[360px] animate-rise overflow-hidden rounded-2xl border border-line bg-surface shadow-float">
              <div className="border-b border-line px-4 py-3 text-[14px] font-bold">اعلان‌ها</div>
              <ul className="scrollbar-thin max-h-[420px] overflow-y-auto">
                {inbox.items.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-muted">اعلانی نیست.</li>}
                {inbox.items.map((n) => (
                  <li key={n.id} className={cn("border-b border-line last:border-0", !n.readAt && "bg-accent-soft/40")}>
                    <Link href={n.link ?? "#"} className="block px-4 py-3 hover:bg-surface-2">
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

        <DropdownMenu.Root>
          <DropdownMenu.Trigger className="flex h-10 items-center gap-2.5 rounded-md ps-2 pe-1 hover:bg-surface-2">
            <span className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-bold text-surface">{user.name.slice(0, 1)}</span>
            <span className="hidden text-start leading-tight md:block">
              <span className="block text-[13px] font-bold">{user.name}</span>
              <span className="block max-w-40 truncate text-[11.5px] text-muted">{user.roles.join("، ")}</span>
            </span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-60 animate-rise rounded-xl border border-line bg-surface p-1.5 shadow-float">
              <div className="flex items-center justify-between px-2.5 py-2">
                <span className="text-[12.5px] text-muted">نمایش</span>
                <ThemeSwitch />
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item asChild>
                <Link href="/" className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] outline-none data-[highlighted]:bg-surface-2"><Store className="size-4 text-muted" /> مشاهده فروشگاه</Link>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={async () => {
                  await api("staff/auth/logout", { method: "POST" });
                  router.push("/panel/login");
                  router.refresh();
                }}
                className="flex h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 text-[13px] text-danger outline-none data-[highlighted]:bg-danger-soft"
              >
                <LogOut className="size-4" /> خروج
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
