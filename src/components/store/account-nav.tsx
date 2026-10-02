"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/account", label: "سفارش‌ها", exact: true },
  { href: "/account/profile", label: "مشخصات و آدرس‌ها" },
];

export function AccountNav() {
  const path = usePathname();
  const router = useRouter();
  return (
    <div className="mt-5 flex items-center gap-1 border-b border-line">
      {TABS.map((t) => {
        const active = t.exact ? path === t.href || path.startsWith("/account/orders") : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className={cn("-mb-px border-b-2 px-3 py-2.5 text-[14px] font-bold transition-colors", active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink")}>
            {t.label}
          </Link>
        );
      })}
      <button
        className="ms-auto flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-bold text-muted hover:text-danger"
        onClick={async () => {
          await api("auth/logout", { method: "POST" });
          router.push("/");
          router.refresh();
        }}
      >
        <LogOut className="size-4" /> خروج
      </button>
    </div>
  );
}
