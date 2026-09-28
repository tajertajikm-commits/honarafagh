import type { StepEstimate } from "@/server/modules/pricing/types";
import type { StepCondition, TemplateStepInput } from "./types";

/**
 * Pure workflow-graph logic: turning a template into the task graph of one
 * order item, deciding which tasks are ready, and computing rework paths.
 * Persistence lives in ./service.ts.
 */

export interface ConditionContext {
  /** Step types of the operations in the resolved spec (e.g. LAMINATION). */
  operationStepTypes: ReadonlySet<string>;
  flags: ReadonlySet<string>;
}

export function evaluateCondition(c: StepCondition, ctx: ConditionContext): boolean {
  switch (c.type) {
    case "ALWAYS":
      return true;
    case "IF_OPERATION":
      return ctx.operationStepTypes.has(c.stepType);
    case "IF_FLAG":
      return ctx.flags.has(c.flag);
    case "IF_NOT_FLAG":
      return !ctx.flags.has(c.flag);
    case "ANY":
      return c.of.some((x) => evaluateCondition(x, ctx));
    case "ALL":
      return c.of.every((x) => evaluateCondition(x, ctx));
  }
}

export interface TemplateIssue {
  step?: string;
  message: string;
}

/** Structural validation used when managers edit templates. */
export function validateTemplate(steps: TemplateStepInput[]): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const keys = new Set<string>();
  for (const s of steps) {
    if (keys.has(s.key)) issues.push({ step: s.key, message: `کلید تکراری «${s.key}»` });
    keys.add(s.key);
  }
  for (const s of steps) {
    for (const d of s.dependsOn) {
      if (!keys.has(d)) issues.push({ step: s.key, message: `وابستگی ناشناخته «${d}»` });
      if (d === s.key) issues.push({ step: s.key, message: "مرحله نمی‌تواند به خودش وابسته باشد" });
    }
    if (s.isQc && s.reworkTargets.length === 0) issues.push({ step: s.key, message: "مرحله QC باید حداقل یک مقصد دوباره‌کاری داشته باشد" });
    if (!s.isQc && s.reworkTargets.length > 0) issues.push({ step: s.key, message: "فقط مراحل QC مقصد دوباره‌کاری دارند" });
    if (s.gate && s.condition.type !== "ALWAYS") issues.push({ step: s.key, message: "مراحل دروازه‌ای باید همیشه فعال باشند" });
  }
  const cycle = findCycle(steps);
  if (cycle) issues.push({ message: `حلقه در وابستگی‌ها: ${cycle.join(" ← ")}` });
  else {
    for (const s of steps.filter((x) => x.isQc)) {
      const upstream = ancestors(steps, s.key);
      for (const t of s.reworkTargets) {
        if (!upstream.has(t)) issues.push({ step: s.key, message: `مقصد دوباره‌کاری «${t}» قبل از این مرحله نیست` });
      }
    }
  }
  if (steps.length > 0 && !steps.some((s) => s.dependsOn.length === 0)) issues.push({ message: "حداقل یک مرحله باید بدون وابستگی باشد" });
  return issues;
}

function findCycle(steps: Pick<TemplateStepInput, "key" | "dependsOn">[]): string[] | null {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (k: string): string[] | null => {
    const st = state.get(k);
    if (st === 2) return null;
    if (st === 1) return [...stack.slice(stack.indexOf(k)), k];
    state.set(k, 1);
    stack.push(k);
    for (const d of byKey.get(k)?.dependsOn ?? []) {
      if (!byKey.has(d)) continue;
      const c = visit(d);
      if (c) return c;
    }
    stack.pop();
    state.set(k, 2);
    return null;
  };
  for (const s of steps) {
    const c = visit(s.key);
    if (c) return c;
  }
  return null;
}

export function ancestors(steps: Pick<TemplateStepInput, "key" | "dependsOn">[], key: string): Set<string> {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const out = new Set<string>();
  const walk = (k: string) => {
    for (const d of byKey.get(k)?.dependsOn ?? []) {
      if (!out.has(d)) {
        out.add(d);
        walk(d);
      }
    }
  };
  walk(key);
  return out;
}

export function descendants(steps: Pick<TemplateStepInput, "key" | "dependsOn">[], key: string): Set<string> {
  const out = new Set<string>();
  let frontier = [key];
  while (frontier.length) {
    const next: string[] = [];
    for (const s of steps) {
      if (!out.has(s.key) && s.dependsOn.some((d) => frontier.includes(d))) {
        out.add(s.key);
        next.push(s.key);
      }
    }
    frontier = next;
  }
  return out;
}

export interface PlannedTask {
  stepKey: string;
  name: string;
  stepType: string;
  dependsOn: string[];
  gate: TemplateStepInput["gate"];
  machineType: string | null;
  isQc: boolean;
  reworkTargets: string[];
  milestone: TemplateStepInput["milestone"];
  checklist: string[];
  minLagMinutes: number;
  estimatedMinutes: number;
  sortOrder: number;
}

/**
 * Instantiates the steps whose condition holds. Dependencies on skipped steps
 * are replaced by those steps' own (resolved) dependencies, so e.g. CUTTING
 * waits on PRINT_QC directly when there is no LAMINATION.
 */
export function planTasks(steps: TemplateStepInput[], ctx: ConditionContext, estimates: StepEstimate[] = []): PlannedTask[] {
  const included = new Set(steps.filter((s) => evaluateCondition(s.condition, ctx)).map((s) => s.key));
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const memo = new Map<string, string[]>();
  const resolve = (key: string): string[] => {
    const cached = memo.get(key);
    if (cached) return cached;
    const out = new Set<string>();
    for (const d of byKey.get(key)?.dependsOn ?? []) {
      if (included.has(d)) out.add(d);
      else resolve(d).forEach((x) => out.add(x));
    }
    const arr = [...out];
    memo.set(key, arr);
    return arr;
  };

  const typeCount = new Map<string, number>();
  for (const s of steps) if (included.has(s.key)) typeCount.set(s.stepType, (typeCount.get(s.stepType) ?? 0) + 1);
  const estimateFor = (s: TemplateStepInput) => {
    const e = estimates.find((x) => x.stepType === s.stepType);
    return e && typeCount.get(s.stepType) === 1 ? e.minutes : s.defaultMinutes;
  };

  const planned = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => included.has(s.key))
    .map(({ s, i }) => ({
      stepKey: s.key,
      name: s.name,
      stepType: s.stepType,
      dependsOn: resolve(s.key),
      gate: s.gate,
      machineType: s.machineType,
      isQc: s.isQc,
      reworkTargets: s.reworkTargets.filter((t) => included.has(t)),
      milestone: s.milestone,
      checklist: s.checklist,
      minLagMinutes: s.minLagMinutes,
      estimatedMinutes: s.gate ? 0 : estimateFor(s),
      sortOrder: i,
    }));
  // Drop redundant transitive edges (A→C when A→B→C) for a readable graph.
  const deps = new Map(planned.map((t) => [t.stepKey, t.dependsOn]));
  for (const t of planned) {
    t.dependsOn = t.dependsOn.filter((d) => !t.dependsOn.some((other) => other !== d && reaches(deps, other, d)));
  }
  return planned;
}

function reaches(deps: Map<string, string[]>, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [...(deps.get(from) ?? [])];
  while (stack.length) {
    const k = stack.pop()!;
    if (k === to) return true;
    if (seen.has(k)) continue;
    seen.add(k);
    stack.push(...(deps.get(k) ?? []));
  }
  return false;
}

// ── Runtime graph (persisted tasks) ─────────────────────────────────────────

export type RuntimeStatus = "PENDING" | "READY" | "IN_PROGRESS" | "PAUSED" | "BLOCKED" | "COMPLETED" | "SKIPPED" | "CANCELLED";

export interface RuntimeTask {
  id: string;
  stepKey: string;
  attempt: number;
  status: RuntimeStatus;
  dependsOn: string[];
  minLagMinutes: number;
  completedAt: Date | null;
}

const SATISFIED: RuntimeStatus[] = ["COMPLETED", "SKIPPED", "CANCELLED"];

/** Latest attempt per step key — earlier attempts are history. */
export function currentAttempts<T extends RuntimeTask>(tasks: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const t of tasks) {
    const cur = out.get(t.stepKey);
    if (!cur || t.attempt > cur.attempt) out.set(t.stepKey, t);
  }
  return out;
}

export interface Readiness {
  id: string;
  earliestStartAt: Date | null;
}

/** PENDING tasks whose dependencies are all satisfied. */
export function findNewlyReady(tasks: RuntimeTask[]): Readiness[] {
  const current = currentAttempts(tasks);
  const out: Readiness[] = [];
  for (const t of current.values()) {
    if (t.status !== "PENDING") continue;
    const deps = t.dependsOn.map((k) => current.get(k)).filter((x): x is RuntimeTask => !!x);
    if (!deps.every((d) => SATISFIED.includes(d.status))) continue;
    const lastDone = deps.reduce<Date | null>((acc, d) => (d.completedAt && (!acc || d.completedAt > acc) ? d.completedAt : acc), null);
    const earliestStartAt = lastDone && t.minLagMinutes > 0 ? new Date(lastDone.getTime() + t.minLagMinutes * 60_000) : null;
    out.push({ id: t.id, earliestStartAt });
  }
  return out;
}

/**
 * Steps that must be redone when QC step `qcKey` sends work back to
 * `targetKey`: every step on a path target → … → qc (inclusive).
 */
export function reworkPath(tasks: Pick<RuntimeTask, "stepKey" | "dependsOn">[], targetKey: string, qcKey: string): string[] {
  const graph = [...new Map(tasks.map((t) => [t.stepKey, { key: t.stepKey, dependsOn: t.dependsOn }])).values()];
  const down = descendants(graph, targetKey);
  const up = ancestors(graph, qcKey);
  const path = graph.filter((s) => s.key === targetKey || s.key === qcKey || (down.has(s.key) && up.has(s.key))).map((s) => s.key);
  return path;
}

/** True when every current attempt is finished. */
export function isGraphComplete(tasks: RuntimeTask[]): boolean {
  return [...currentAttempts(tasks).values()].every((t) => SATISFIED.includes(t.status));
}
