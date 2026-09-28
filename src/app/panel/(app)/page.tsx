import { redirect } from "next/navigation";
import { visibleNav } from "@/components/panel/nav";
import { requireStaffPage } from "@/server/http/session";

/** Lands each employee in the first workspace their roles grant. */
export default async function PanelHome() {
  const ctx = await requireStaffPage();
  const first = visibleNav(ctx.actor)[0]?.items[0];
  redirect(first?.href ?? "/panel/forbidden");
}
