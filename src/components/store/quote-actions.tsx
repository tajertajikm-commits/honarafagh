"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";

export function QuoteActions({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Button loading={pending} onClick={() => start(async () => {
        try {
          const o = await api<{ id: string }>(`quotes/${quoteId}/accept`, { method: "POST" });
          toast.success("پیش‌فاکتور پذیرفته شد و سفارش ثبت شد.");
          router.push(`/account/orders/${o.id}?placed=1`);
        } catch (e) { toast.error(e instanceof ApiError ? e.message : "خطا"); }
      })}>پذیرش و ثبت سفارش</Button>
      <Button variant="ghost" disabled={pending} onClick={() => start(async () => {
        try { await api(`quotes/${quoteId}/reject`, { body: {} }); router.refresh(); } catch (e) { toast.error(e instanceof ApiError ? e.message : "خطا"); }
      })}>رد پیش‌فاکتور</Button>
    </div>
  );
}
