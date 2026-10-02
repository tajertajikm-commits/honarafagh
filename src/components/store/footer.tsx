import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeSwitch } from "@/components/brand/theme";

export function StoreFooter({ business }: { business: { name: string; phone: string; address: string } }) {
  return (
    <footer className="mt-24 border-t border-line bg-surface no-print">
      <div className="brand-spectrum-rtl h-1" />
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo height={52} />
          <p className="mt-4 max-w-sm text-[13.5px] leading-7 text-muted">
            چاپخانه هنر آفاق؛ چاپ افست و دیجیتال با قیمت‌گذاری شفاف، کنترل کیفیت مرحله‌به‌مرحله و پیگیری آنلاین سفارش.
          </p>
        </div>
        <div>
          <p className="text-[13px] font-bold text-ink">دسترسی سریع</p>
          <ul className="mt-3 space-y-2 text-[13.5px] text-muted">
            <li><Link className="hover:text-ink" href="/products">همه محصولات</Link></li>
            <li><Link className="hover:text-ink" href="/order">ثبت سفارش اختصاصی</Link></li>
            <li><Link className="hover:text-ink" href="/track">پیگیری سفارش</Link></li>
            <li><Link className="hover:text-ink" href="/account">حساب کاربری</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-[13px] font-bold text-ink">تماس</p>
          <ul className="mt-3 space-y-2 text-[13.5px] text-muted">
            <li>{business.address}</li>
            <li>
              تلفن: <bdi dir="ltr" className="tabular">{business.phone}</bdi>
            </li>
            <li>شنبه تا چهارشنبه ۸ تا ۱۷، پنج‌شنبه ۸ تا ۱۳</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-[12.5px] text-muted sm:px-6">
          <p>© {new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(new Date())} {business.name}. همه حقوق محفوظ است.</p>
          <div className="flex items-center gap-3">
            <Link href="/panel/login" className="hover:text-ink">ورود کارکنان</Link>
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </footer>
  );
}
