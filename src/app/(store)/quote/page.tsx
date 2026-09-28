import type { Metadata } from "next";
import { QuoteRequestForm } from "@/components/store/quote-request";
import { storefrontCtx } from "@/server/http/session";
import { listProducts } from "@/server/modules/catalog/queries";

export const metadata: Metadata = { title: "استعلام قیمت سفارشی" };

export default async function QuoteRequestPage() {
  const ctx = await storefrontCtx();
  const products = await listProducts(ctx.db);
  return (
    <div className="mx-auto max-w-2xl px-4 pt-12">
      <h1 className="text-[28px] font-bold">استعلام قیمت سفارشی</h1>
      <p className="mt-2 text-[14.5px] leading-7 text-muted">برای کارهایی که در فروشگاه نیست یا مشخصات خاص دارند، جزئیات را بنویسید. کارشناس فروش ظرف یک روز کاری پیش‌فاکتور رسمی صادر می‌کند.</p>
      <QuoteRequestForm loggedIn={ctx.actor.kind === "customer"} products={products.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
