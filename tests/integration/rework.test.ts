import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/server/db/client";
import { customers, orderItems, orders, productionSteps, users } from "@/server/db/schema";
import { createCtx, type Ctx } from "@/server/core/context";
import { storeUpload } from "@/server/modules/files/service";
import { approveOrder } from "@/server/modules/orders/approval";
import { artworkOf, completeDesign, reviewArtwork, startDesign, uploadArtwork } from "@/server/modules/orders/artwork";
import { createCustomOrder } from "@/server/modules/orders/create";
import { myWork } from "@/server/modules/queues/service";
import { dispatchOrder, markDelivered, shipmentOf } from "@/server/modules/shipping/service";
import { assignDesigner, assignStep, completeStep, decideQuality, editPlan, returnOrder, startStep } from "@/server/modules/workflow/engine";
import type { ReferenceIds } from "@/server/seed/seed-reference";
import { AZAD, LABAFI, MANAGER, MEMARIAN, resetTestDb, staffCtx } from "../helpers/db";

let ref: ReferenceIds;
const db = () => getDb();
const staff: Record<string, Ctx> = {};
const PDF = Buffer.from("%PDF-1.4\n%rework\n%%EOF");
let phoneSeq = 0;

async function digitalOrder(stations: string[], opts: { needsDesign?: boolean } = {}) {
  const phone = `0935100${String(++phoneSeq).padStart(4, "0")}`;
  const [u] = await db().insert(users).values({ phone, fullName: "مشتری", kind: "CUSTOMER" }).returning();
  const [c] = await db().insert(customers).values({ phone, fullName: "مشتری", userId: u!.id }).returning();
  const ctx = createCtx({ kind: "customer", userId: u!.id, customerId: c!.id, name: "مشتری" });
  const files = opts.needsDesign ? [] : [(await storeUpload(ctx, { data: PDF, filename: "a.pdf", purpose: "ARTWORK" })).id];
  const o = await createCustomOrder(ctx, { productionType: "DIGITAL", title: "کار آزمون", quantity: 100, needsDesign: !!opts.needsDesign, artworkFileIds: files, idempotencyKey: `rw-${phoneSeq}` });
  await approveOrder(staff[LABAFI]!, o.id, { steps: stations });
  if (!opts.needsDesign) {
    const [art] = await artworkOf(staff[LABAFI]!, o.id);
    await reviewArtwork(staff[LABAFI]!, art!.artwork.id, { approve: true });
  }
  return o.id;
}
const steps = async (orderId: string) => Object.fromEntries((await db().select().from(productionSteps).where(eq(productionSteps.orderId, orderId))).map((s) => [s.key, s]));
const id = async (orderId: string, key: string) => (await steps(orderId))[key]!.id;
const order = async (orderId: string) => (await db().select().from(orders).where(eq(orders.id, orderId)))[0]!;

beforeAll(async () => {
  ref = await resetTestDb();
  for (const code of [MANAGER, LABAFI, AZAD, MEMARIAN]) staff[code] = await staffCtx(ref, code);
});
afterAll(async () => {
  await closeDb();
});

describe("reassigning a task (manager only)", () => {
  it("the manager hands a step to Azad: it is hers; Labafi can no longer do it; others cannot reassign", async () => {
    const o = await digitalOrder(["D_PRINT", "D_PACKAGING"]);
    const print = await id(o, "D_PRINT");
    await expect(assignStep(staff[LABAFI]!, print, ref.employees.get("azad")!.employeeId)).rejects.toThrow(/مجوز/);
    // Hossein (accountant) has no digital production permission: cannot be given the step.
    await expect(assignStep(staff[MANAGER]!, print, ref.employees.get("abdali")!.employeeId)).rejects.toThrow(/دسترسی/);
    await assignStep(staff[MANAGER]!, print, ref.employees.get("azad")!.employeeId);
    expect((await steps(o)).D_PRINT!.assignedBy).not.toBeNull();
    expect((await myWork(staff[LABAFI]!)).stations.flatMap((g) => g.items).some((i) => i.stepId === print)).toBe(false);
    expect((await myWork(staff[AZAD]!)).stations.flatMap((g) => g.items).some((i) => i.stepId === print)).toBe(true);
    await expect(completeStep(staff[LABAFI]!, print)).rejects.toThrow(/سپرده/);
    await completeStep(staff[AZAD]!, print);
    expect((await steps(o)).D_PRINT!.status).toBe("DONE");
  });

  it("the manager gives the design to another designer", async () => {
    const o = await digitalOrder(["D_PRINT"], { needsDesign: true });
    await expect(assignDesigner(staff[LABAFI]!, o, ref.employees.get("memarian")!.employeeId)).rejects.toThrow(/مجوز/);
    await expect(assignDesigner(staff[MANAGER]!, o, ref.employees.get("azad")!.employeeId)).rejects.toThrow(/طراحی/);
    await assignDesigner(staff[MANAGER]!, o, ref.employees.get("memarian")!.employeeId);
    expect((await order(o)).designerId).toBe(ref.employees.get("memarian")!.employeeId);
  });
});

describe("undo and sending work back", () => {
  it("whoever recorded a step can undo it until the next step starts; after that only the manager", async () => {
    const o = await digitalOrder(["D_SHEET", "D_PRINT", "D_CUT", "D_QUALITY", "D_PACKAGING"]);
    await completeStep(staff[AZAD]!, await id(o, "D_SHEET"));
    // Someone else cannot undo Azad's step; Azad can.
    await expect(returnOrder(staff[LABAFI]!, o, { target: "D_SHEET", reason: "اشتباه" })).rejects.toThrow(/خودتان/);
    await returnOrder(staff[AZAD]!, o, { target: "D_SHEET", reason: "اشتباهی زدم" });
    let s = await steps(o);
    expect(s.D_SHEET!.status).toBe("READY");
    expect(s.D_PRINT!.status).toBe("WAITING");
    await completeStep(staff[AZAD]!, s.D_SHEET!.id);
    await startStep(staff[AZAD]!, await id(o, "D_PRINT"));
    await expect(returnOrder(staff[AZAD]!, o, { target: "D_SHEET", reason: "اشتباه" })).rejects.toThrow(/مرحله بعد/);
    // The manager can send it back anywhere; everything after is redone.
    await completeStep(staff[AZAD]!, await id(o, "D_PRINT"));
    await completeStep(staff[AZAD]!, await id(o, "D_CUT"));
    await decideQuality(staff[LABAFI]!, await id(o, "D_QUALITY"), { approve: true });
    await returnOrder(staff[MANAGER]!, o, { target: "D_PRINT", reason: "رنگ با نمونه مشتری فرق دارد" });
    s = await steps(o);
    expect(s.D_PRINT!.status).toBe("READY");
    expect(s.D_PRINT!.reworkCount).toBe(1);
    expect(s.D_SHEET!.status).toBe("DONE");
    for (const k of ["D_CUT", "D_QUALITY", "D_PACKAGING"]) expect(s[k]!.status).toBe("WAITING");
    expect((await order(o)).status).toBe("IN_PRODUCTION");
  });

  it("quality rejection can send the job back to design (designed → printed → rejected → redesign)", async () => {
    const o = await digitalOrder(["D_PRINT", "D_CUT", "D_QUALITY"], { needsDesign: true });
    await startDesign(staff[MEMARIAN]!, o);
    const f = await storeUpload(staff[MEMARIAN]!, { data: PDF, filename: "d.pdf", purpose: "DESIGN" });
    await uploadArtwork(staff[MEMARIAN]!, o, { fileIds: [f.id] });
    await completeDesign(staff[MEMARIAN]!, o);
    await completeStep(staff[AZAD]!, await id(o, "D_PRINT"));
    await completeStep(staff[AZAD]!, await id(o, "D_CUT"));
    await decideQuality(staff[LABAFI]!, await id(o, "D_QUALITY"), { approve: false, reason: "متن طرح غلط دارد", returnTo: "DESIGN" });
    const s = await steps(o);
    expect((await order(o)).artworkStatus).toBe("DESIGN_REQUESTED");
    expect(s.D_PRINT!.status).toBe("READY"); // waits for the new design
    expect(s.D_PRINT!.reworkCount).toBe(1);
    expect(s.D_CUT!.status).toBe("WAITING");
    await expect(startStep(staff[AZAD]!, s.D_PRINT!.id)).rejects.toThrow(/طراحی/);
    expect((await myWork(staff[MEMARIAN]!)).design.map((d) => d.id)).toContain(o);
  });

  it("the customer calls after design approval: back to design, or ask the customer for a new file", async () => {
    const o = await digitalOrder(["D_PRINT", "D_PACKAGING"]);
    await returnOrder(staff[MANAGER]!, o, { target: "CUSTOMER_FILE", reason: "مشتری تماس گرفت و فایل جدید می‌فرستد" });
    expect((await order(o)).artworkStatus).toBe("NEEDS_CORRECTION");
    await returnOrder(staff[MANAGER]!, o, { target: "DESIGN", reason: "طراحی توسط چاپخانه انجام شود" });
    const row = await order(o);
    expect(row.artworkStatus).toBe("DESIGN_REQUESTED");
    expect(row.needsDesign).toBe(true);
    await expect(returnOrder(staff[LABAFI]!, o, { target: "DESIGN", reason: "تست" })).rejects.toThrow(/مدیر/);
  });

  it("returning a dispatched order cancels the dispatch; a delivered order cannot be returned", async () => {
    const o = await digitalOrder(["D_PRINT", "D_PACKAGING"]);
    await completeStep(staff[AZAD]!, await id(o, "D_PRINT"));
    await completeStep(staff[LABAFI]!, await id(o, "D_PACKAGING"));
    await dispatchOrder(staff[LABAFI]!, o, { method: "COURIER" });
    await returnOrder(staff[MANAGER]!, o, { target: "D_PACKAGING", reason: "بسته‌بندی آسیب دید" });
    expect(await shipmentOf(staff[MANAGER]!, o)).toBeNull();
    expect((await steps(o)).D_SHIPPING!.status).toBe("WAITING");
    expect((await order(o)).status).toBe("IN_PRODUCTION");
    await completeStep(staff[LABAFI]!, await id(o, "D_PACKAGING"));
    await dispatchOrder(staff[LABAFI]!, o, { method: "PICKUP", deliveredById: ref.employees.get("azad")!.employeeId });
    expect((await order(o)).status).toBe("DELIVERED");
    await expect(returnOrder(staff[MANAGER]!, o, { target: "D_PRINT", reason: "تست" })).rejects.toThrow(/تحویل/);
  });
});

describe("changing the plan mid-job", () => {
  it("the customer wants lamination after printing: it joins the plan, later steps are redone, the charge is added", async () => {
    const o = await digitalOrder(["D_PRINT", "D_CUT", "D_QUALITY", "D_PACKAGING"]);
    await completeStep(staff[AZAD]!, await id(o, "D_PRINT"));
    await completeStep(staff[AZAD]!, await id(o, "D_CUT"));
    await decideQuality(staff[LABAFI]!, await id(o, "D_QUALITY"), { approve: true });
    await expect(editPlan(staff[AZAD]!, o, { add: ["D_LAMINATION"], reason: "مشتری سلفون خواست" })).rejects.toThrow(/مجوز/);
    await editPlan(staff[MANAGER]!, o, { add: ["D_LAMINATION"], reason: "مشتری بعد از چاپ سلفون خواست", charge: 1_500_000 });
    const s = await steps(o);
    expect(s.D_LAMINATION!.status).toBe("READY");
    expect(s.D_CUT!.status).toBe("DONE"); // before lamination: stays done
    expect(s.D_QUALITY!.status).toBe("WAITING"); // after lamination: checked again
    const items = await db().select().from(orderItems).where(eq(orderItems.orderId, o));
    expect(items.some((i) => i.title.includes("سلفون") && i.lineSubtotal === 1_500_000)).toBe(true);
    // Unfinished optional stations can be dropped; finished or required ones cannot.
    await expect(editPlan(staff[MANAGER]!, o, { remove: ["D_CUT"], reason: "حذف" })).rejects.toThrow(/انجام شده/);
    await expect(editPlan(staff[MANAGER]!, o, { remove: ["D_SHIPPING"], reason: "حذف" })).rejects.toThrow(/الزامی/);
    await editPlan(staff[LABAFI]!, o, { remove: ["D_LAMINATION"], reason: "مشتری منصرف شد" });
    expect((await steps(o)).D_LAMINATION).toBeUndefined();
    expect((await steps(o)).D_QUALITY!.status).toBe("READY");
  });
});

describe("who handed the order to the customer", () => {
  it("courier: the courier who took it; can be named explicitly", async () => {
    const o = await digitalOrder(["D_PRINT"]);
    await completeStep(staff[AZAD]!, await id(o, "D_PRINT"));
    await dispatchOrder(staff[LABAFI]!, o, { method: "COURIER", responsibleId: ref.employees.get("azad")!.employeeId });
    await markDelivered(staff[LABAFI]!, o, { recipientName: "خانم رضایی" });
    const s = await shipmentOf(staff[LABAFI]!, o);
    expect(s!.deliveredByName).toBe("خانم آزاد");
    expect(s!.shipment.recipientName).toBe("خانم رضایی");
  });
});
