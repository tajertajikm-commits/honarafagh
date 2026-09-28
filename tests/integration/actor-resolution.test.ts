import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { closeDb, getDb } from "@/server/db/client";
import { customers, users } from "@/server/db/schema";
import { createSession } from "@/server/auth/sessions";
import { resolveActor, SURFACE_HEADER } from "@/server/http/route";
import { CUSTOMER_COOKIE, STAFF_COOKIE } from "@/server/http/cookies";
import type { ReferenceIds } from "@/server/seed/seed-reference";
import { MANAGER, resetTestDb } from "../helpers/db";

let ref: ReferenceIds;
let staffToken = "";
let customerToken = "";

function req(cookies: Record<string, string>, surface?: "store" | "panel") {
  const headers = new Headers({ cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") });
  if (surface) headers.set(SURFACE_HEADER, surface);
  return new NextRequest("http://localhost/api/v1/notifications", { headers });
}

beforeAll(async () => {
  ref = await resetTestDb();
  staffToken = (await createSession(getDb(), ref.employees.get(MANAGER)!.userId, "STAFF", {})).token;
  const [u] = await getDb().insert(users).values({ phone: "09350000001", fullName: "مشتری", kind: "CUSTOMER" }).returning();
  await getDb().insert(customers).values({ phone: "09350000001", fullName: "مشتری", userId: u!.id });
  customerToken = (await createSession(getDb(), u!.id, "CUSTOMER", {})).token;
});
afterAll(async () => {
  await closeDb();
});

describe("resolveActor with both sessions in one browser", () => {
  const both = () => ({ [STAFF_COOKIE]: staffToken, [CUSTOMER_COOKIE]: customerToken });

  it("'any' routes prefer the session of the calling surface", async () => {
    expect((await resolveActor(req(both(), "store"), "any")).kind).toBe("customer");
    expect((await resolveActor(req(both(), "panel"), "any")).kind).toBe("staff");
    expect((await resolveActor(req(both()), "any")).kind).toBe("staff");
  });

  it("falls back to the other session, and never crosses kinds", async () => {
    expect((await resolveActor(req({ [STAFF_COOKIE]: staffToken }, "store"), "any")).kind).toBe("staff");
    expect((await resolveActor(req({ [CUSTOMER_COOKIE]: customerToken }, "panel"), "any")).kind).toBe("customer");
    // A customer token in the staff cookie is not a staff session.
    await expect(resolveActor(req({ [STAFF_COOKIE]: customerToken }, "panel"), "staff")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await resolveActor(req({ [CUSTOMER_COOKIE]: staffToken }, "store"), "any")).kind).toBe("anonymous");
  });

  it("the surface header cannot promote a customer to staff", async () => {
    await expect(resolveActor(req({ [CUSTOMER_COOKIE]: customerToken }, "panel"), "staff")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await resolveActor(req(both(), "store"), "staff")).kind).toBe("staff");
    expect((await resolveActor(req(both(), "panel"), "customer")).kind).toBe("customer");
  });
});
