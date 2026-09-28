import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  findNewlyReady,
  isGraphComplete,
  planTasks,
  reworkPath,
  type RuntimeTask,
  validateTemplate,
} from "@/server/modules/workflow/graph";
import { templateStepInputSchema } from "@/server/modules/workflow/types";
import { DIGITAL_TEMPLATE_STEPS, OFFSET_TEMPLATE_STEPS } from "@/server/seed/reference";

const ctx = (ops: string[] = [], flags: string[] = []) => ({ operationStepTypes: new Set(ops), flags: new Set(flags) });
const deps = (tasks: ReturnType<typeof planTasks>) => Object.fromEntries(tasks.map((t) => [t.stepKey, t.dependsOn.sort()]));

describe("conditions", () => {
  it("evaluates nested conditions", () => {
    const c = ctx(["LAMINATION"], ["NEEDS_DESIGN"]);
    expect(evaluateCondition({ type: "ALWAYS" }, c)).toBe(true);
    expect(evaluateCondition({ type: "IF_OPERATION", stepType: "UV_COATING" }, c)).toBe(false);
    expect(evaluateCondition({ type: "ANY", of: [{ type: "IF_OPERATION", stepType: "UV_COATING" }, { type: "IF_FLAG", flag: "NEEDS_DESIGN" }] }, c)).toBe(true);
    expect(evaluateCondition({ type: "ALL", of: [{ type: "IF_OPERATION", stepType: "LAMINATION" }, { type: "IF_NOT_FLAG", flag: "NEEDS_DESIGN" }] }, c)).toBe(false);
  });
});

describe("template validation", () => {
  it("accepts the seeded Offset and Digital templates", () => {
    expect(validateTemplate(OFFSET_TEMPLATE_STEPS)).toEqual([]);
    expect(validateTemplate(DIGITAL_TEMPLATE_STEPS)).toEqual([]);
  });

  it("detects cycles, unknown dependencies and invalid rework targets", () => {
    const step = (key: string, dependsOn: string[], extra: Partial<Parameters<typeof templateStepInputSchema.parse>[0]> = {}) =>
      templateStepInputSchema.parse({ key, name: key, stepType: "PREPRESS", dependsOn, milestone: "PRODUCTION", ...extra });
    expect(validateTemplate([step("A", ["C"]), step("B", ["A"]), step("C", ["B"])]).map((i) => i.message).join()).toMatch(/حلقه/);
    expect(validateTemplate([step("A", []), step("B", ["X"])]).map((i) => i.message).join()).toMatch(/ناشناخته/);
    expect(validateTemplate([step("A", []), step("Q", ["A"], { isQc: true, reworkTargets: ["Z"] })]).map((i) => i.message).join()).toMatch(/دوباره‌کاری/);
  });
});

describe("planning (Offset)", () => {
  it("builds the flowchart's parallel preparation branches and join", () => {
    const tasks = planTasks(OFFSET_TEMPLATE_STEPS, ctx(["CUTTING", "PACKAGING", "PREPRESS"]));
    const d = deps(tasks);
    // Design skipped → file approval has no dependency
    expect(d.DESIGN).toBeUndefined();
    expect(d.FILE_APPROVAL).toEqual([]);
    // Parallel branches start immediately
    expect(d.PAPER).toEqual([]);
    expect(d.PLATE_STOCK).toEqual([]);
    expect(d.PAYMENT).toEqual([]);
    // Join: printing needs plates (prepress + plate stock + payment) and cut paper
    expect(d.PLATE_MAKING).toEqual(["PAYMENT", "PLATE_STOCK", "PREPRESS"]);
    expect(d.PRINTING).toEqual(["PAPER_CUTTING", "PLATE_MAKING"]);
    // No lamination → cutting waits on print QC directly; no finishing → final QC waits on cutting
    expect(d.CUTTING).toEqual(["PRINT_QC"]);
    expect(d.FINAL_QC).toEqual(["CUTTING"]);
    expect(tasks.map((t) => t.stepKey)).not.toContain("LAMINATION");
  });

  it("includes conditional finishing steps chosen by the customer", () => {
    const tasks = planTasks(OFFSET_TEMPLATE_STEPS, ctx(["LAMINATION", "CUTTING", "UV_COATING", "BINDING"], ["NEEDS_DESIGN"]));
    const d = deps(tasks);
    expect(d.FILE_APPROVAL).toEqual(["DESIGN"]);
    expect(d.LAMINATION).toEqual(["PRINT_QC"]);
    expect(d.CUTTING).toEqual(["LAMINATION"]);
    expect(d.UV).toEqual(["CUTTING"]);
    expect(d.BINDING).toEqual(["UV"]);
    expect(d.FINAL_QC).toEqual(["BINDING"]);
    expect(tasks.find((t) => t.stepKey === "LAMINATION")!.minLagMinutes).toBe(240);
  });

  it("uses pricing estimates for step durations", () => {
    const tasks = planTasks(OFFSET_TEMPLATE_STEPS, ctx(["CUTTING"]), [{ stepType: "OFFSET_PRINTING", minutes: 95, quantity: 1000, unit: "برگ" }]);
    expect(tasks.find((t) => t.stepKey === "PRINTING")!.estimatedMinutes).toBe(95);
    // Two QC steps share a type → template defaults are used
    expect(tasks.find((t) => t.stepKey === "PRINT_QC")!.estimatedMinutes).toBe(20);
    expect(tasks.find((t) => t.stepKey === "PAPER")!.estimatedMinutes).toBe(0);
  });
});

describe("planning (Digital) differs from Offset", () => {
  it("has no plates, no pre-cutting and no separate print QC", () => {
    const keys = planTasks(DIGITAL_TEMPLATE_STEPS, ctx(["CUTTING"])).map((t) => t.stepKey);
    expect(keys).not.toContain("PLATE_MAKING");
    expect(keys).not.toContain("PLATE_STOCK");
    expect(keys).not.toContain("PAPER_CUTTING");
    expect(keys).not.toContain("PRINT_QC");
    expect(keys).toContain("PRINTING");
  });

  it("routes shaped stickers through the plotter instead of the guillotine", () => {
    const d = deps(planTasks(DIGITAL_TEMPLATE_STEPS, ctx(["PLOTTER_CUTTING"])));
    expect(d.CUTTING).toBeUndefined();
    expect(d.PLOTTER).toEqual(["PRINTING"]);
    expect(d.FINAL_QC).toEqual(["PLOTTER"]);
  });
});

describe("runtime readiness", () => {
  const t = (stepKey: string, dependsOn: string[], status: RuntimeTask["status"] = "PENDING", extra: Partial<RuntimeTask> = {}): RuntimeTask => ({
    id: `${stepKey}-${extra.attempt ?? 1}`,
    stepKey,
    attempt: 1,
    status,
    dependsOn,
    minLagMinutes: 0,
    completedAt: status === "COMPLETED" ? new Date("2026-09-28T10:00:00Z") : null,
    ...extra,
  });

  it("waits for every dependency (join)", () => {
    const tasks = [t("PREP", [], "COMPLETED"), t("PAPER", [], "IN_PROGRESS"), t("PRINT", ["PREP", "PAPER"])];
    expect(findNewlyReady(tasks)).toEqual([]);
    tasks[1]!.status = "COMPLETED";
    expect(findNewlyReady(tasks).map((r) => r.id)).toEqual(["PRINT-1"]);
  });

  it("applies minimum lag (ink drying) from the last dependency", () => {
    const tasks = [t("QC", [], "COMPLETED"), t("LAM", ["QC"], "PENDING", { minLagMinutes: 240 })];
    expect(findNewlyReady(tasks)[0]!.earliestStartAt!.toISOString()).toBe("2026-09-28T14:00:00.000Z");
  });

  it("only considers the latest attempt of a step", () => {
    const tasks = [
      t("PRINT", [], "COMPLETED"),
      t("PRINT", [], "PENDING", { attempt: 2, id: "PRINT-2" }),
      t("QC", ["PRINT"]),
    ];
    // QC must wait for the rework attempt of PRINT
    expect(findNewlyReady(tasks).map((r) => r.id)).toEqual(["PRINT-2"]);
    expect(isGraphComplete(tasks)).toBe(false);
  });

  it("computes the rework path between a target and the rejecting QC step", () => {
    const tasks = planTasks(OFFSET_TEMPLATE_STEPS, ctx(["LAMINATION", "CUTTING", "BINDING"]));
    expect(reworkPath(tasks, "PRINTING", "FINAL_QC")).toEqual(["PRINTING", "PRINT_QC", "LAMINATION", "CUTTING", "BINDING", "FINAL_QC"]);
    expect(reworkPath(tasks, "BINDING", "FINAL_QC")).toEqual(["BINDING", "FINAL_QC"]);
    expect(reworkPath(tasks, "PRINTING", "PRINT_QC")).toEqual(["PRINTING", "PRINT_QC"]);
  });
});
