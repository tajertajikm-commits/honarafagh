import { AccountNav } from "@/components/store/account-nav";
import { requireCustomerPage } from "@/server/http/session";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCustomerPage("/account");
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">حساب کاربری</p>
          <h1 className="text-[24px] font-bold">{ctx.actor.name || "خوش آمدید"}</h1>
        </div>
      </div>
      <AccountNav />
      <div className="mt-6">{children}</div>
    </div>
  );
}
