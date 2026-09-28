import { describe, expect, it } from "vitest";
import { addWorkingMinutes, DEFAULT_CALENDAR, workingMinutesBetween } from "@/server/modules/scheduling/calendar";
import { schedule, type SchedTask } from "@/server/modules/scheduling/scheduler";

// 2026-09-26 is a Saturday. Tehran = UTC+03:30 → 08:00 local = 04:30Z.
const at = (iso: string) => new Date(iso);

describe("work calendar", () => {
  it("adds minutes inside the working day", () => {
    expect(addWorkingMinutes(DEFAULT_CALENDAR, at("2026-09-26T05:00:00Z"), 60).toISOString()).toBe("2026-09-26T06:00:00.000Z");
  });

  it("rolls over to the next working day", () => {
    // Sat 16:30 local (13:00Z) + 60 min → 30 min Sat + 30 min Sun from 08:00 local
    expect(addWorkingMinutes(DEFAULT_CALENDAR, at("2026-09-26T13:00:00Z"), 60).toISOString()).toBe("2026-09-27T05:00:00.000Z");
  });

  it("treats Thursday as a half day and skips Friday", () => {
    // Thu 2026-10-01 12:00 local (08:30Z) + 120 min → 60 min Thu (until 13:00) + 60 min Sat 08:00–09:00
    expect(addWorkingMinutes(DEFAULT_CALENDAR, at("2026-10-01T08:30:00Z"), 120).toISOString()).toBe("2026-10-03T05:30:00.000Z");
  });

  it("snaps starts outside working hours to the next opening", () => {
    // Friday → Saturday 08:00 local
    expect(addWorkingMinutes(DEFAULT_CALENDAR, at("2026-10-02T10:00:00Z"), 0).toISOString()).toBe("2026-10-03T04:30:00.000Z");
  });

  it("measures working minutes between instants", () => {
    expect(workingMinutesBetween(DEFAULT_CALENDAR, at("2026-09-26T04:30:00Z"), at("2026-09-27T04:30:00Z"))).toBe(540);
  });
});

describe("scheduler", () => {
  const base: Omit<SchedTask, "id" | "jobId" | "stepKey"> = {
    status: "PENDING",
    dependsOn: [],
    machineTypeCode: null,
    machineId: null,
    estimatedMinutes: 60,
    workedMinutes: 0,
    minLagMinutes: 0,
    earliestStartAt: null,
    completedAt: null,
    isGate: false,
    sortOrder: 0,
  };
  const now = at("2026-09-26T04:30:00Z"); // Sat 08:00 local
  const machines = [
    { id: "press-1", typeCode: "OFFSET_PRESS", available: true },
    { id: "press-2", typeCode: "OFFSET_PRESS", available: true },
  ];

  it("respects dependencies within a job", () => {
    const r = schedule({
      now,
      calendar: DEFAULT_CALENDAR,
      machines,
      jobs: [{ id: "J1", priority: 50, dueDate: null }],
      tasks: [
        { ...base, id: "a", jobId: "J1", stepKey: "PREP", estimatedMinutes: 30 },
        { ...base, id: "b", jobId: "J1", stepKey: "PRINT", dependsOn: ["PREP"], machineTypeCode: "OFFSET_PRESS", estimatedMinutes: 90 },
      ],
    });
    expect(r.tasks.get("b")!.start.getTime()).toBe(r.tasks.get("a")!.end.getTime());
    expect(r.jobCompletion.get("J1")!.toISOString()).toBe("2026-09-26T06:30:00.000Z");
  });

  it("spreads work across machines of the same type and queues by priority", () => {
    const task = (id: string, jobId: string) => ({ ...base, id, jobId, stepKey: "PRINT", machineTypeCode: "OFFSET_PRESS", estimatedMinutes: 120 });
    const r = schedule({
      now,
      calendar: DEFAULT_CALENDAR,
      machines,
      jobs: [
        { id: "low", priority: 80, dueDate: null },
        { id: "urgent", priority: 10, dueDate: null },
        { id: "normal", priority: 50, dueDate: null },
      ],
      tasks: [task("t-low", "low"), task("t-urgent", "urgent"), task("t-normal", "normal")],
    });
    expect(r.tasks.get("t-urgent")!.start.getTime()).toBe(now.getTime());
    expect(r.tasks.get("t-normal")!.start.getTime()).toBe(now.getTime());
    expect(r.tasks.get("t-urgent")!.machineId).not.toBe(r.tasks.get("t-normal")!.machineId);
    expect(r.tasks.get("t-low")!.start.getTime()).toBe(now.getTime() + 120 * 60_000);
    expect([...r.machineLoad.values()].reduce((s, l) => s + l.queuedMinutes, 0)).toBe(360);
  });

  it("flags jobs projected to miss their due date", () => {
    const r = schedule({
      now,
      calendar: DEFAULT_CALENDAR,
      machines,
      jobs: [{ id: "J", priority: 50, dueDate: at("2026-09-26T05:00:00Z") }],
      tasks: [{ ...base, id: "x", jobId: "J", stepKey: "PRINT", machineTypeCode: "OFFSET_PRESS", estimatedMinutes: 120 }],
    });
    expect(r.lateJobs).toHaveLength(1);
    expect(r.lateJobs[0]!.lateMinutes).toBe(90);
  });

  it("waits for gates expected to clear later (e.g. paper arriving)", () => {
    const arrival = at("2026-09-28T06:00:00Z");
    const r = schedule({
      now,
      calendar: DEFAULT_CALENDAR,
      machines,
      jobs: [{ id: "J", priority: 50, dueDate: null }],
      tasks: [
        { ...base, id: "g", jobId: "J", stepKey: "PAPER", isGate: true, estimatedMinutes: 0, expectedClearAt: arrival },
        { ...base, id: "p", jobId: "J", stepKey: "PRINT", dependsOn: ["PAPER"], machineTypeCode: "OFFSET_PRESS" },
      ],
    });
    expect(r.tasks.get("p")!.start.toISOString()).toBe(arrival.toISOString());
  });

  it("avoids maintenance windows", () => {
    const r = schedule({
      now,
      calendar: DEFAULT_CALENDAR,
      machines: [{ id: "m", typeCode: "OFFSET_PRESS", available: true, unavailable: [{ from: now, to: at("2026-09-26T07:30:00Z") }] }],
      jobs: [{ id: "J", priority: 50, dueDate: null }],
      tasks: [{ ...base, id: "x", jobId: "J", stepKey: "PRINT", machineTypeCode: "OFFSET_PRESS" }],
    });
    expect(r.tasks.get("x")!.start.toISOString()).toBe("2026-09-26T07:30:00.000Z");
  });

  it("reports tasks with no machine of the required type", () => {
    const r = schedule({
      now,
      calendar: DEFAULT_CALENDAR,
      machines,
      jobs: [{ id: "J", priority: 50, dueDate: null }],
      tasks: [{ ...base, id: "x", jobId: "J", stepKey: "UV", machineTypeCode: "UV_COATER" }],
    });
    expect(r.unschedulable.map((u) => u.taskId)).toEqual(["x"]);
  });
});
