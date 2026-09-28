import { Sidebar } from "@/components/panel/sidebar";
import { Topbar } from "@/components/panel/topbar";
import { visibleNav } from "@/components/panel/nav";
import { requireStaffPage } from "@/server/http/session";
import { roles } from "@/server/db/schema";
import { inArray } from "drizzle-orm";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireStaffPage();
  const sections = visibleNav(ctx.actor);
  const roleNames = ctx.actor.roleCodes.length ? (await ctx.db.select({ name: roles.name }).from(roles).where(inArray(roles.code, [...ctx.actor.roleCodes]))).map((r) => r.name) : [];
  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-e border-line bg-surface lg:block">
        <Sidebar sections={sections} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: ctx.actor.name, roles: roleNames }} sections={sections} />
        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
