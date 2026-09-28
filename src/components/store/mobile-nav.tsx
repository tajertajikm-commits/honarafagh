"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/ui/dialog";

export function MobileNav({ items }: { items: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="-ms-2 grid size-10 place-items-center rounded-md text-ink-2 hover:bg-surface-2 md:hidden" onClick={() => setOpen(true)} aria-label="منو">
        <Menu className="size-5" />
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="منو" width="max-w-xs">
        <nav className="flex flex-col gap-1">
          {[{ href: "/", label: "صفحه اصلی" }, ...items, { href: "/account", label: "حساب کاربری" }, { href: "/cart", label: "سبد خرید" }].map((n) => (
            <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-md px-3 py-3 text-[15px] font-bold hover:bg-surface-2">
              {n.label}
            </Link>
          ))}
        </nav>
      </Sheet>
    </>
  );
}
