import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/server/db/client";
import { loadCustomerActor, loadStaffActor, resolveSession } from "@/server/auth/sessions";
import type { Permission, Workspace } from "@/server/auth/permissions";
import { type Ctx, createCtx, type CustomerActor, type StaffActor } from "@/server/core/context";
import { CUSTOMER_COOKIE, STAFF_COOKIE } from "./cookies";

/** Resolved once per request (React cache). */
export const getStaffActor = cache(async (): Promise<StaffActor | null> => {
  const token = (await cookies()).get(STAFF_COOKIE)?.value;
  if (!token) return null;
  const s = await resolveSession(getDb(), token, "STAFF");
  return s ? loadStaffActor(getDb(), s.userId) : null;
});

export const getCustomerActor = cache(async (): Promise<CustomerActor | null> => {
  const token = (await cookies()).get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  const s = await resolveSession(getDb(), token, "CUSTOMER");
  return s ? loadCustomerActor(getDb(), s.userId) : null;
});

async function requestMeta() {
  const h = await headers();
  return { ip: clientIp(h), userAgent: h.get("user-agent") ?? undefined, requestId: h.get("x-request-id") ?? undefined };
}

export function clientIp(h: Headers): string | undefined {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
}

/** For panel pages: redirects to login when unauthenticated, 403-page when lacking access. */
export async function requireStaffPage(opts: { permission?: Permission; anyOf?: Permission[]; workspace?: Workspace } = {}): Promise<Ctx & { actor: StaffActor }> {
  const actor = await getStaffActor();
  if (!actor) redirect("/panel/login");
  const denied =
    (opts.permission && !actor.permissions.has(opts.permission)) ||
    (opts.anyOf && !opts.anyOf.some((p) => actor.permissions.has(p))) ||
    (opts.workspace && !actor.workspaces.includes(opts.workspace));
  if (denied) redirect("/panel/forbidden");
  return createCtx(actor, await requestMeta()) as Ctx & { actor: StaffActor };
}

export async function requireCustomerPage(next: string): Promise<Ctx & { actor: CustomerActor }> {
  const actor = await getCustomerActor();
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}`);
  return createCtx(actor, await requestMeta()) as Ctx & { actor: CustomerActor };
}

export async function storefrontCtx(): Promise<Ctx> {
  const actor = await getCustomerActor();
  return createCtx(actor ?? { kind: "anonymous" }, await requestMeta());
}
