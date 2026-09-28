import type { Metadata } from "next";
import { PageHeader } from "@/components/panel/page";
import { Station } from "@/components/panel/station";
import { toStationProps } from "@/components/panel/station-mapper";
import { requireStaffPage } from "@/server/http/session";
import { stationData } from "@/server/modules/production/station";

export const metadata: Metadata = { title: "کارهای من" };

export default async function StationPage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const { task } = await searchParams;
  const ctx = await requireStaffPage({ workspace: "station" });
  const types = ctx.actor.stepTypes.filter((s) => s !== "QC" && s !== "DESIGN");
  const data = await stationData(ctx, task, { stepTypes: types });
  const props = toStationProps(data, ctx.actor.employeeId);
  return (
    <>
      <PageHeader title="کارهای من" description="کارهای حوزه شما که پیش‌نیازهایشان آماده است؛ کار سپرده‌شده به شما در ابتدای صف است." />
      <Station {...props} basePath="/panel/station" />
    </>
  );
}
