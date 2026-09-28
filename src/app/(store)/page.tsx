import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Calculator, FileUp, Gauge, PackageCheck, Truck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/store/product-card";
import { storefrontCtx } from "@/server/http/session";
import { listCategories, listProducts } from "@/server/modules/catalog/queries";
import { startingPrice } from "@/server/modules/catalog/storefront";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await storefrontCtx();
  const [categories, products] = [await listCategories(ctx.db), await listProducts(ctx.db)];
  const featured = products.filter((p) => p.isFeatured).slice(0, 6);
  const cards = [];
  for (const p of featured) cards.push({ slug: p.slug, name: p.name, subtitle: p.subtitle, image: p.image?.url ?? null, unitLabel: p.unitLabel, from: await startingPrice(ctx.db, p) });

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pt-20">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] font-bold text-ink-2 shadow-soft">
              <span className="brand-spectrum-rtl h-2 w-8 rounded-full" />
              چاپ افست و دیجیتال
            </span>
            <h1 className="mt-5 text-balance text-[34px] font-bold leading-[1.35] sm:text-[42px]">
              چاپ حرفه‌ای،
              <br />
              به سادگی یک <span className="text-accent-ink">سفارش آنلاین</span>
            </h1>
            <p className="mt-5 max-w-lg text-pretty text-[16px] leading-8 text-muted">
              محصول را پیکربندی کنید، قیمت دقیق را همان لحظه ببینید، فایل را بارگذاری کنید و سفارش را از پیش از چاپ تا تحویل، مرحله‌به‌مرحله دنبال کنید.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/products">
                  شروع سفارش
                  <ArrowLeft />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/quote">استعلام قیمت سفارشی</Link>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6">
              {[
                ["قیمت", "لحظه‌ای و شفاف"],
                ["پیگیری", "مرحله‌به‌مرحله"],
                ["کیفیت", "کنترل در هر مرحله"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd className="mt-0.5 text-[14px] font-bold">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-[480px]">
            <div className="absolute inset-6 rounded-[40px] bg-gradient-to-br from-surface to-surface-2 shadow-card" />
            <div className="absolute inset-x-12 top-10 h-2 rounded-full brand-spectrum-rtl opacity-90" />
            <Image src="/catalog/notebook.svg" alt="" width={420} height={315} priority className="absolute right-0 top-14 w-[72%] drop-shadow-xl" />
            <Image src="/catalog/business-card.svg" alt="" width={360} height={270} className="absolute bottom-6 left-0 w-[64%]" />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {categories.map((c) => (
            <Link key={c.id} href={`/products?c=${c.slug}`} className="group rounded-2xl border border-line bg-surface p-5 shadow-soft transition-colors hover:border-line-strong">
              <p className="text-[15px] font-bold">{c.name}</p>
              <p className="mt-1 line-clamp-2 text-[12.5px] leading-6 text-muted">{c.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-accent-ink">
                مشاهده <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto mt-20 max-w-6xl px-4 sm:px-6">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-[26px] font-bold">محصولات پرطرفدار</h2>
            <p className="mt-1 text-[14px] text-muted">قیمت‌ها با تنظیمات پیش‌فرض محاسبه شده‌اند؛ در صفحه محصول دقیق می‌شوند.</p>
          </div>
          <Link href="/products" className="hidden items-center gap-1 text-[14px] font-bold text-accent-ink sm:inline-flex">
            همه محصولات <ArrowLeft className="size-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((p, i) => (
            <ProductCard key={p.slug} p={p} priority={i < 3} />
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <div className="rounded-[28px] border border-line bg-surface p-8 shadow-card sm:p-12">
          <h2 className="text-[26px] font-bold">از پیکربندی تا تحویل</h2>
          <p className="mt-2 max-w-xl text-[14.5px] leading-7 text-muted">هر سفارش با همان گردش‌کاری تولید می‌شود که کارکنان ما در چاپخانه دنبال می‌کنند؛ شما در هر مرحله می‌دانید سفارش کجاست.</p>
          <ol className="mt-10 grid gap-8 md:grid-cols-4">
            {[
              { icon: Calculator, t: "پیکربندی و قیمت", d: "جنس، ابعاد، تیراژ و روکش را انتخاب کنید؛ قیمت نهایی با مالیات همان لحظه محاسبه می‌شود." },
              { icon: FileUp, t: "فایل یا طراحی", d: "فایل آماده را بارگذاری کنید یا طراحی را به ما بسپارید و نمونه را آنلاین تأیید کنید." },
              { icon: Wallet, t: "پرداخت امن", d: "کل مبلغ یا پیش‌پرداخت را آنلاین بپردازید؛ مانده را هنگام تحویل تسویه کنید." },
              { icon: Truck, t: "تولید و تحویل", d: "از چاپ تا کنترل کیفیت و بسته‌بندی را دنبال کنید؛ ارسال با پیک یا تحویل حضوری." },
            ].map((s, i) => (
              <li key={s.t} className="relative">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-ink text-surface">
                    <s.icon className="size-5" />
                  </span>
                  <span className="text-[13px] font-bold text-subtle tabular">۰{["۱", "۲", "۳", "۴"][i]}</span>
                </div>
                <p className="mt-4 text-[16px] font-bold">{s.t}</p>
                <p className="mt-1.5 text-[13.5px] leading-7 text-muted">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Offset vs digital */}
      <section className="mx-auto mt-24 grid max-w-6xl gap-5 px-4 sm:px-6 md:grid-cols-2">
        <div className="rounded-[28px] bg-ink p-8 text-surface sm:p-10">
          <Gauge className="size-6 text-brand-amber" />
          <h3 className="mt-5 text-[22px] font-bold text-surface">روش چاپ را ما انتخاب می‌کنیم</h3>
          <p className="mt-3 text-[14.5px] leading-8 text-surface/70">
            برای تیراژهای کم، چاپ دیجیتال سریع‌تر و اقتصادی‌تر است و برای تیراژهای بالا چاپ افست. موتور قیمت‌گذاری هر دو را محاسبه می‌کند و مقرون‌به‌صرفه‌ترین را پیشنهاد می‌دهد.
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            { icon: BadgeCheck, t: "کنترل کیفیت واقعی", d: "هر سفارش پیش از بسته‌بندی بازرسی می‌شود و در صورت ایراد، دوباره تولید می‌شود." },
            { icon: PackageCheck, t: "قیمت ثابت", d: "قیمتی که هنگام سفارش می‌بینید، همان قیمت نهایی است؛ تغییر نرخ‌ها روی سفارش شما اثر ندارد." },
          ].map((f) => (
            <div key={f.t} className="rounded-[28px] border border-line bg-surface p-7 shadow-soft">
              <f.icon className="size-6 text-accent-ink" />
              <p className="mt-4 text-[16px] font-bold">{f.t}</p>
              <p className="mt-2 text-[13.5px] leading-7 text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Custom quote CTA */}
      <section className="mx-auto mt-24 max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-[28px] border border-line bg-gradient-to-l from-accent-soft to-surface p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-[22px] font-bold">سفارش خاصی دارید؟</h2>
            <p className="mt-2 max-w-lg text-[14px] leading-7 text-muted">جعبه، بسته‌بندی، کتاب یا هر کار چاپی دیگر؛ مشخصات را بفرستید تا پیش‌فاکتور رسمی برایتان صادر شود.</p>
          </div>
          <Button asChild size="lg" variant="primary">
            <Link href="/quote">
              درخواست پیش‌فاکتور <ArrowLeft />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
