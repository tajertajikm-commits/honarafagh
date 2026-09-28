import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted"><ShieldCheck className="size-7" /></div>
        <h1 className="mt-4 text-[20px] font-bold">دسترسی به این بخش ندارید</h1>
        <p className="mt-2 text-[14px] leading-7 text-muted">نقش‌های کاربری شما اجازه مشاهده این صفحه را نمی‌دهد. در صورت نیاز با مدیر سامانه تماس بگیرید.</p>
        <Button asChild className="mt-6"><Link href="/panel">بازگشت به فضای کار</Link></Button>
      </div>
    </div>
  );
}
