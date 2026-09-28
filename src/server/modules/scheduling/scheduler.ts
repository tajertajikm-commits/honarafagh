import { addWorkingMinutes, nextWorkingInstant, type WorkCalendar } from "./calendar";

/**
 * Finite-capacity forward scheduler (greedy list scheduling).
 *
 * Machines are the constrained resources; manual steps without a machine type
 * are treated as unconstrained. It is deliberately simple and deterministic —
 * the output (projected start/end per task, completion per job, load per
 * machine) is a foundation for a future optimiser, not a replacement for one.
 */

export interface SchedMachine {
  id: string;
  typeCode: string;
  available: boolean;
  /** Blocked windows (maintenance). */
  unavailable?: { from: Date; to: Date }[];
}

export interface SchedTask {
  id: string;
  jobId: string;
  stepKey: string;
  status: "PENDING" | "READY" | "IN_PROGRESS" | "PAUSED" | "BLOCKED" | "COMPLETED" | "SKIPPED" | "CANCELLED";
  dependsOn: string[];
  machineTypeCode: string | null;
  machineId: string | null;
  estimatedMinutes: number;
  /** Minutes already worked (for in-progress / paused tasks). */
  workedMinutes: number;
  minLagMinutes: number;
  earliestStartAt: Date | null;
  completedAt: Date | null;
  /** For unsatisfied gates: when the blocking condition is expected to clear (e.g. PO arrival). */
  expectedClearAt?: Date | null;
  isGate: boolean;
  sortOrder: number;
}

export interface SchedJob {
  id: string;
  priority: number;
  dueDate: Date | null;
}

export interface ScheduledTask {
  taskId: string;
  jobId: string;
  machineId: string | null;
  start: Date;
  end: Date;
}

export interface ScheduleResult {
  tasks: Map<string, ScheduledTask>;
  jobCompletion: Map<string, Date>;
  lateJobs: { jobId: string; dueDate: Date; projected: Date; lateMinutes: number }[];
  machineLoad: Map<string, { queuedMinutes: number; busyUntil: Date | null; taskCount: number }>;
  unschedulable: { taskId: string; reason: string }[];
}

const DONE = new Set(["COMPLETED", "SKIPPED", "CANCELLED"]);

export function schedule(input: { now: Date; calendar: WorkCalendar; machines: SchedMachine[]; jobs: SchedJob[]; tasks: SchedTask[] }): ScheduleResult {
  const { calendar, now } = input;
  const start0 = nextWorkingInstant(calendar, now);
  const jobs = new Map(input.jobs.map((j) => [j.id, j]));
  const machineFree = new Map<string, Date>();
  const machineLoad: ScheduleResult["machineLoad"] = new Map();
  for (const m of input.machines) {
    machineFree.set(m.id, start0);
    machineLoad.set(m.id, { queuedMinutes: 0, busyUntil: null, taskCount: 0 });
  }
  const machinesByType = new Map<string, SchedMachine[]>();
  for (const m of input.machines.filter((x) => x.available)) {
    machinesByType.set(m.typeCode, [...(machinesByType.get(m.typeCode) ?? []), m]);
  }

  const out = new Map<string, ScheduledTask>();
  const unschedulable: ScheduleResult["unschedulable"] = [];
  const byJobKey = new Map<string, SchedTask>();
  for (const t of input.tasks) byJobKey.set(`${t.jobId}|${t.stepKey}`, t);

  // 1. Finished tasks are fixed in the past.
  for (const t of input.tasks) {
    if (DONE.has(t.status)) {
      const at = t.completedAt ?? now;
      out.set(t.id, { taskId: t.id, jobId: t.jobId, machineId: t.machineId, start: at, end: at });
    }
  }

  // 2. Running tasks occupy their machine from now.
  const running = input.tasks.filter((t) => t.status === "IN_PROGRESS");
  for (const t of running) {
    const remaining = Math.max(Math.ceil(t.estimatedMinutes * 0.1), t.estimatedMinutes - t.workedMinutes);
    const end = addWorkingMinutes(calendar, start0, remaining);
    out.set(t.id, { taskId: t.id, jobId: t.jobId, machineId: t.machineId, start: now, end });
    if (t.machineId && machineFree.has(t.machineId)) {
      machineFree.set(t.machineId, maxDate(machineFree.get(t.machineId)!, end));
      bumpLoad(machineLoad, t.machineId, remaining, end);
    }
  }

  // 3. List-schedule the rest in priority order as dependencies resolve.
  const pending = input.tasks.filter((t) => !out.has(t.id));
  const rank = (t: SchedTask) => {
    const j = jobs.get(t.jobId);
    return [j?.priority ?? 50, j?.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER, t.sortOrder] as const;
  };
  let guard = pending.length * pending.length + 10;
  while (pending.length && guard-- > 0) {
    const ready = pending.filter((t) => t.dependsOn.every((d) => {
      const dep = byJobKey.get(`${t.jobId}|${d}`);
      return !dep || out.has(dep.id);
    }));
    if (ready.length === 0) {
      for (const t of pending) unschedulable.push({ taskId: t.id, reason: "dependency cycle or missing dependency" });
      break;
    }
    ready.sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    });
    const t = ready[0]!;
    pending.splice(pending.indexOf(t), 1);

    let depsEnd = start0;
    for (const d of t.dependsOn) {
      const dep = byJobKey.get(`${t.jobId}|${d}`);
      const s = dep && out.get(dep.id);
      if (s) depsEnd = maxDate(depsEnd, s.end);
    }
    let earliest = depsEnd;
    if (t.minLagMinutes > 0 && t.dependsOn.length) earliest = new Date(depsEnd.getTime() + t.minLagMinutes * 60_000); // drying is calendar time
    if (t.earliestStartAt) earliest = maxDate(earliest, t.earliestStartAt);

    if (t.isGate) {
      const clear = maxDate(earliest, t.expectedClearAt ?? earliest);
      out.set(t.id, { taskId: t.id, jobId: t.jobId, machineId: null, start: earliest, end: clear });
      continue;
    }

    const remaining = Math.max(0, t.estimatedMinutes - t.workedMinutes);
    let machineId: string | null = null;
    let start = nextWorkingInstant(calendar, earliest);
    if (t.machineTypeCode) {
      const candidates = t.machineId
        ? input.machines.filter((m) => m.id === t.machineId)
        : (machinesByType.get(t.machineTypeCode) ?? []);
      if (candidates.length === 0) {
        unschedulable.push({ taskId: t.id, reason: `no available machine of type ${t.machineTypeCode}` });
        const end = addWorkingMinutes(calendar, start, remaining);
        out.set(t.id, { taskId: t.id, jobId: t.jobId, machineId: null, start, end });
        continue;
      }
      let best: { id: string; start: Date; end: Date } | null = null;
      for (const m of candidates) {
        let s = nextWorkingInstant(calendar, maxDate(start, machineFree.get(m.id) ?? start0));
        s = skipUnavailable(calendar, m, s, remaining);
        const e = addWorkingMinutes(calendar, s, remaining);
        if (!best || e < best.end) best = { id: m.id, start: s, end: e };
      }
      machineId = best!.id;
      start = best!.start;
      machineFree.set(machineId, best!.end);
      bumpLoad(machineLoad, machineId, remaining, best!.end);
    }
    const end = addWorkingMinutes(calendar, start, remaining);
    out.set(t.id, { taskId: t.id, jobId: t.jobId, machineId, start, end });
  }

  const jobCompletion = new Map<string, Date>();
  for (const s of out.values()) {
    const cur = jobCompletion.get(s.jobId);
    if (!cur || s.end > cur) jobCompletion.set(s.jobId, s.end);
  }
  const lateJobs: ScheduleResult["lateJobs"] = [];
  for (const [jobId, projected] of jobCompletion) {
    const due = jobs.get(jobId)?.dueDate;
    if (due && projected > due) lateJobs.push({ jobId, dueDate: due, projected, lateMinutes: Math.round((projected.getTime() - due.getTime()) / 60_000) });
  }
  lateJobs.sort((a, b) => b.lateMinutes - a.lateMinutes);
  return { tasks: out, jobCompletion, lateJobs, machineLoad, unschedulable };
}

function skipUnavailable(cal: WorkCalendar, m: SchedMachine, start: Date, minutes: number): Date {
  let s = start;
  for (let i = 0; i < 20; i++) {
    const e = addWorkingMinutes(cal, s, minutes);
    const clash = m.unavailable?.find((w) => s < w.to && e > w.from);
    if (!clash) return s;
    s = nextWorkingInstant(cal, clash.to);
  }
  return s;
}

function bumpLoad(load: ScheduleResult["machineLoad"], id: string, minutes: number, end: Date) {
  const l = load.get(id);
  if (!l) return;
  l.queuedMinutes += minutes;
  l.taskCount += 1;
  l.busyUntil = l.busyUntil && l.busyUntil > end ? l.busyUntil : end;
}

const maxDate = (a: Date, b: Date) => (a > b ? a : b);
