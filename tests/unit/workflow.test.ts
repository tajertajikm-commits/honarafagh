import { describe, expect, it } from "vitest";
import { blockedReason, defaultReturnTarget, readySteps, statusFromSteps } from "@/server/modules/workflow/engine";
import { normalizePlan, stationsOf, suggestedPlan } from "@/server/modules/workflow/stations";
import { queueOrder, type QueueItem } from "@/server/modules/queues/service";
import { customerStatus } from "@/lib/order-status";

type S = { key: string; phase: number; status: "WAITING" | "READY" | "IN_PROGRESS" | "DONE" };
const plan = (type: "DIGITAL" | "OFFSET", keys: string[]): S[] => normalizePlan(type, keys).map((s) => ({ key: s.key, phase: s.phase, status: "WAITING" }));

describe("plans", () => {
  it("adds the required stations and keeps process order", () => {
    expect(normalizePlan("DIGITAL", ["D_CUT", "D_PRINT"]).map((s) => s.key)).toEqual(["D_PRINT", "D_CUT", "D_SHIPPING"]);
    expect(normalizePlan("OFFSET", ["O_CUT"]).map((s) => s.key)).toEqual(["O_PRINT", "O_PRINT_QUALITY", "O_CUT", "O_FINAL_QUALITY", "O_SHIPPING"]);
    expect(() => normalizePlan("DIGITAL", ["O_PRINT"])).toThrow();
  });

  it("Digital and Offset stay distinct processes", () => {
    expect(stationsOf("DIGITAL").every((s) => s.key.startsWith("D_"))).toBe(true);
    expect(stationsOf("OFFSET").filter((s) => s.phase === 1).map((s) => s.key)).toEqual(["O_LITHO", "O_PAPER"]);
  });

  it("suggests stations from priced store operations", () => {
    const keys = suggestedPlan("DIGITAL", ["LAMINATION", "CUTTING"]);
    expect(keys).toContain("D_LAMINATION");
    expect(keys).not.toContain("D_BINDING");
  });
});

describe("queue readiness", () => {
  it("lithography and paper are ready together; printing waits for both", () => {
    const p = plan("OFFSET", ["O_LITHO", "O_PAPER", "O_CUT"]);
    expect(readySteps(p).map((s) => s.key)).toEqual(["O_LITHO", "O_PAPER"]);
    p.find((s) => s.key === "O_PAPER")!.status = "DONE";
    p.find((s) => s.key === "O_LITHO")!.status = "IN_PROGRESS";
    expect(readySteps(p)).toEqual([]);
    p.find((s) => s.key === "O_LITHO")!.status = "DONE";
    expect(readySteps(p).map((s) => s.key)).toEqual(["O_PRINT"]);
  });

  it("derives the order lifecycle from its plan", () => {
    const p = plan("DIGITAL", ["D_PRINT", "D_PACKAGING"]);
    expect(statusFromSteps(p)).toBe("APPROVED");
    p[0]!.status = "IN_PROGRESS";
    expect(statusFromSteps(p)).toBe("IN_PRODUCTION");
    p[0]!.status = "DONE";
    p[1]!.status = "DONE";
    expect(statusFromSteps(p)).toBe("READY");
    p[2]!.status = "IN_PROGRESS";
    expect(statusFromSteps(p)).toBe("SHIPPING");
    p[2]!.status = "DONE";
    expect(statusFromSteps(p)).toBe("DELIVERED");
  });

  it("a quality rejection returns to the closest earlier production step", () => {
    expect(defaultReturnTarget(plan("OFFSET", ["O_LITHO", "O_PAPER", "O_CUT", "O_LAMINATION"]), "O_PRINT_QUALITY")).toBe("O_PRINT");
    expect(defaultReturnTarget(plan("OFFSET", ["O_CUT", "O_LAMINATION"]), "O_FINAL_QUALITY")).toBe("O_LAMINATION");
    expect(defaultReturnTarget(plan("DIGITAL", ["D_PRINT", "D_QUALITY"]), "D_QUALITY")).toBe("D_PRINT");
  });

  it("explains why a ready step cannot start", () => {
    expect(blockedReason({ key: "D_PRINT", status: "READY", machineId: null }, { artworkStatus: "AWAITING_REVIEW" })).toMatch(/فایل/);
    expect(blockedReason({ key: "D_PRINT", status: "READY", machineId: null }, { artworkStatus: "DESIGN_IN_PROGRESS" })).toMatch(/طراحی/);
    expect(blockedReason({ key: "O_PRINT", status: "READY", machineId: null }, { artworkStatus: "APPROVED" })).toMatch(/ماشین/);
    expect(blockedReason({ key: "D_CUT", status: "READY", machineId: null }, { artworkStatus: "AWAITING_FILE" })).toBeNull();
  });

  it("orders the queue: in progress, then priority (when granted), then first come", () => {
    const item = (code: string, o: Partial<QueueItem> & { prio?: number | null; ready: number }): QueueItem =>
      ({ stepId: code, key: "O_PRINT", status: o.status ?? "READY", readyAt: new Date(o.ready), order: { code, isPriority: o.prio != null, prioritySetAt: o.prio != null ? new Date(o.prio) : null } }) as unknown as QueueItem;
    const q = [item("#1052", { ready: 2 }), item("#1053", { ready: 3, prio: 10 }), item("#1051", { ready: 1 }), item("#1054", { ready: 4 }), item("#1050", { ready: 5, status: "IN_PROGRESS" })];
    expect(q.sort(queueOrder).map((i) => i.order.code)).toEqual(["#1050", "#1053", "#1051", "#1052", "#1054"]);
  });
});

describe("customer status", () => {
  it("maps the internal lifecycle to six stages", () => {
    expect(customerStatus("NEEDS_INFO").label).toBe("در انتظار تأیید");
    expect(customerStatus("NEEDS_INFO").action).toMatch(/توضیح/);
    expect(customerStatus("IN_PRODUCTION").label).toBe("در حال آماده‌سازی");
    expect(customerStatus("DELIVERED").index).toBe(5);
    expect(customerStatus("IN_PRODUCTION", "NEEDS_CORRECTION").action).toMatch(/اصلاح/);
    expect(customerStatus("REJECTED").stage).toBeNull();
  });
});
