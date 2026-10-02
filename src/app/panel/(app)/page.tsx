import { redirect } from "next/navigation";
import { homeFor } from "@/components/panel/nav";
import { requireStaffPage } from "@/server/http/session";

/** The manager lands on the control center; everyone else on their work list. */
export default async function PanelHome() {
  const ctx = await requireStaffPage();
  redirect(homeFor(ctx.actor));
}
