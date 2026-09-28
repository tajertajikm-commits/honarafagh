import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page";
import { Station } from "@/components/panel/station";
import { toStationProps } from "@/components/panel/station-mapper";
import { requireStaffPage } from "@/server/http/session";
import { stationData } from "@/server/modules/production/station";

export const metadata: Metadata = { title: "کنترل کیفیت" };

export default async function QcPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  const ctx = await requireStaffPage({ workspace: "qc" });
  const data = await stationData(ctx, task, { stepTypes: ["QC"] });
  return (
    <>
      <PageHeader title="کنترل کیفیت" description="بازرسی پس از چاپ و پیش از بسته‌بندی؛ رد شدن، مراحل مربوط را برای دوباره‌کاری باز می‌کند." />
      <Station {...toStationProps(data, ctx.actor.employeeId)} basePath="/panel/qc" emptyTitle="بازرسی در انتظار نیست" />
    </>
  );
}
