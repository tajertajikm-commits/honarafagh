import Link from "next/link";
import { ShoppingBag, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { toFaDigits } from "@/lib/persian";
import { MobileNav } from "./mobile-nav";
import { NotificationsBell } from "./notifications-bell";

const NAV = [
  { href: "/products", label: "محصولات" },
  { href: "/order", label: "سفارش اختصاصی" },
  { href: "/track", label: "پیگیری سفارش" },
];

export function StoreHeader({ cartCount, customerName }: { cartCount: number; customerName: string | null }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-xl no-print">
      <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-6 px-4 sm:px-6">
        <MobileNav items={NAV} />
        <Link href="/" className="flex items-center" aria-label="هنر آفاق — صفحه اصلی">
          <Logo height={50} priority />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="ناوبری اصلی">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-[14px] font-bold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1.5">
          <Link href={customerName !== null ? "/account" : "/login"} className="flex h-10 items-center gap-2 rounded-md px-3 text-[14px] font-bold text-ink-2 hover:bg-surface-2 hover:text-ink">
            <UserRound className="size-[18px]" />
            <span className="hidden max-w-[10rem] truncate sm:inline">{customerName || (customerName === "" ? "حساب من" : "ورود")}</span>
          </Link>
          {customerName !== null && <NotificationsBell />}
          <Link href="/cart" className="relative grid size-10 place-items-center rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink" aria-label={`سبد خرید (${cartCount})`}>
            <ShoppingBag className="size-[19px]" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -left-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-ink px-1 text-[11px] font-bold text-white tabular">{toFaDigits(cartCount)}</span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
