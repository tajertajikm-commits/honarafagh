import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KV, PageHeader } from "@/components/panel/page";
import { BusinessSettingsForm, InvoiceSettingsForm } from "@/components/panel/settings-forms";
import { env } from "@/server/config/env";
import { requireStaffPage } from "@/server/http/session";
import { getSetting } from "@/server/modules/settings/service";

export const metadata: Metadata = { title: "تنظیمات" };

/** Integration status only; secrets are never sent to the browser. */
function integrations() {
  const e = env();
  const row = (label: string, provider: string, live: boolean, note: string) => ({ label, provider, live, note });
  return [
    row("پیامک و کد ورود", e.OTP_PROVIDER === "smsir" ? "SMS.ir" : "شبیه‌ساز (Fake)", e.OTP_PROVIDER === "smsir", e.OTP_PROVIDER === "smsir" ? "کلید API و قالب از متغیرهای محیطی خوانده می‌شود." : "کد ورود در محیط توسعه نمایش داده می‌شود؛ پیامکی ارسال نمی‌شود."),
    row("پیامک اطلاع‌رسانی", e.SMS_PROVIDER === "smsir" ? "SMS.ir" : "شبیه‌ساز (Fake)", e.SMS_PROVIDER === "smsir", e.SMS_PROVIDER === "smsir" ? "" : "پیامک‌ها فقط در لاگ سرور ثبت می‌شوند."),
    row("درگاه پرداخت", e.PAYMENT_PROVIDER === "zarinpal" ? `زرین‌پال${e.ZARINPAL_SANDBOX ? " (سندباکس)" : ""}` : "درگاه آزمایشی", e.PAYMENT_PROVIDER === "zarinpal" && !e.ZARINPAL_SANDBOX, e.PAYMENT_PROVIDER === "zarinpal" ? "" : "پرداخت واقعی انجام نمی‌شود."),
    row("ذخیره‌سازی فایل", e.STORAGE_DRIVER === "s3" ? "S3 سازگار" : "دیسک محلی", e.STORAGE_DRIVER === "s3", e.STORAGE_DRIVER === "s3" ? "" : "برای چند سرور، ذخیره‌ساز S3 را فعال کنید."),
    row("حسابداری", e.ACCOUNTING_PROVIDER === "holoo" ? "هلو" : "داخلی", false, e.ACCOUNTING_PROVIDER === "holoo" ? "آداپتر هلو پیاده‌سازی نشده؛ رویدادها در صف می‌مانند تا مشخصات API هلو در دسترس باشد." : "اسناد در همین سامانه نگهداری می‌شوند."),
  ];
}

export default async function SettingsPage() {
  const ctx = await requireStaffPage({ permission: "settings.manage" });
  const business = await getSetting(ctx.db, "business");
  const invoice = await getSetting(ctx.db, "invoice");
  const e = env();
  return (
    <>
      <PageHeader title="تنظیمات" description="اطلاعات فروشنده روی فاکتور، مالیات و وضعیت اتصال‌ها. همه تغییرات در گزارش ممیزی ثبت می‌شوند." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="اطلاعات فروشنده" description="روی فاکتورهای رسمی و غیررسمی چاپ می‌شود." />
          <CardBody className="pt-0"><BusinessSettingsForm value={business} /></CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="فاکتور" />
            <CardBody className="pt-0"><InvoiceSettingsForm value={invoice} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="اتصال‌ها" description="از طریق متغیرهای محیطی سرور پیکربندی می‌شوند." actions={e.DEMO_MODE ? <Badge tone="warning">حالت نمایشی</Badge> : null} />
            <CardBody className="pt-0">
              <ul className="divide-y divide-line">
                {integrations().map((i) => (
                  <li key={i.label} className="py-2.5">
                    <KV label={i.label} className="py-0"><span className="flex items-center gap-2">{i.provider}<Badge tone={i.live ? "success" : "neutral"}>{i.live ? "پیکربندی شده" : "شبیه‌ساز / محلی"}</Badge></span></KV>
                    {i.note && <p className="mt-0.5 text-[12px] text-muted">{i.note}</p>}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
