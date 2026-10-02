"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calculator, Factory, Gauge, History, Inbox, Layers, Package, Printer, Receipt, Settings2, ShieldCheck, Truck, Users, Wallet, type LucideIcon } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";
import type { NavItem } from "./nav";

const ICONS: Record<string, LucideIcon> = {
  inbox: Inbox, gauge: Gauge, printer: Printer, factory: Factory, receipt: Receipt, wallet: Wallet, users: Users, package: Package, truck: Truck,
  layers: Layers, calculator: Calculator, shield: ShieldCheck, settings: Settings2, history: History,
};

export function Sidebar({ sections, badges, onNavigate }: { sections: { title: string; items: NavItem[] }[]; badges?: Record<string, number>; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex h-full flex-col" aria-label="ناوبری پنل">
      <Link href="/panel" className="flex h-16 shrink-0 items-center gap-2.5 px-5" onClick={onNavigate}>
        <LogoMark size={34} />
        <span className="leading-tight">
          <span className="block text-[15px] font-bold">هنر آفاق</span>
          <span className="block text-[11.5px] text-muted">سامانه عملیات چاپخانه</span>
        </span>
      </Link>
      <div className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-2">
        {sections.map((s) => (
          <div key={s.title}>
            <p className="mb-1.5 px-3 text-[11.5px] font-bold text-subtle">{s.title}</p>
            <ul className="space-y-0.5">
              {s.items.map((i) => {
                const Icon = ICONS[i.icon] ?? Gauge;
                const active = path === i.href || path.startsWith(i.href + "/");
                const badge = badges?.[i.href];
                return (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-bold transition-colors",
                        active ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      <Icon className={cn("size-[17px] shrink-0", active ? "text-brand-amber" : "text-muted group-hover:text-ink")} />
                      <span className="flex-1 truncate">{i.label}</span>
                      {badge ? <span className={cn("rounded-full px-1.5 text-[11px] tabular", active ? "bg-surface/20" : "bg-accent-soft text-accent-ink")}>{new Intl.NumberFormat("fa-IR").format(badge)}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
