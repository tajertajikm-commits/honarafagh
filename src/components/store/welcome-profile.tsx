"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api-client";

export function WelcomeProfile({ customerId, next }: { customerId: string; next: string | null }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent-soft/60 p-5 sm:flex-row sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim().length < 2) return;
        setLoading(true);
        try {
          await api(`customers/${customerId}`, { method: "PATCH", body: { fullName: name.trim() } });
          if (next) router.push(next);
          router.refresh();
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : "خطا");
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="flex-1">
        <p className="text-[15px] font-bold">به هنر آفاق خوش آمدید</p>
        <p className="mb-3 text-[13px] text-muted">نام شما روی فاکتور و مرسوله درج می‌شود.</p>
        <Input placeholder="نام و نام خانوادگی" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button type="submit" loading={loading}>ذخیره{next ? " و ادامه" : ""}</Button>
    </form>
  );
}
