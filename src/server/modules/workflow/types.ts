import { z } from "zod";

/**
 * Conditions decide whether a template step is instantiated for a given
 * order item. They are evaluated against the resolved product spec
 * (operations chosen by the customer and flags such as NEEDS_DESIGN).
 */
export type StepCondition =
  | { type: "ALWAYS" }
  | { type: "IF_OPERATION"; stepType: string }
  | { type: "IF_FLAG"; flag: string }
  | { type: "IF_NOT_FLAG"; flag: string }
  | { type: "ANY"; of: StepCondition[] }
  | { type: "ALL"; of: StepCondition[] };

export const stepConditionSchema: z.ZodType<StepCondition> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("ALWAYS") }),
    z.object({ type: z.literal("IF_OPERATION"), stepType: z.string().min(1) }),
    z.object({ type: z.literal("IF_FLAG"), flag: z.string().min(1) }),
    z.object({ type: z.literal("IF_NOT_FLAG"), flag: z.string().min(1) }),
    z.object({ type: z.literal("ANY"), of: z.array(stepConditionSchema).min(1) }),
    z.object({ type: z.literal("ALL"), of: z.array(stepConditionSchema).min(1) }),
  ]),
);

/**
 * Gates are system-driven steps: they complete automatically when a
 * condition in another domain becomes true (file approved, materials
 * reserved, deposit received). Managers can override them (audited).
 */
export const gateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("FILE_APPROVAL") }),
  z.object({ kind: z.literal("MATERIAL"), purposes: z.array(z.enum(["PAPER", "PLATE", "OPERATION"])).min(1) }),
  z.object({ kind: z.literal("PAYMENT") }),
]);
export type Gate = z.infer<typeof gateSchema>;

export const CUSTOMER_MILESTONES = ["FILE", "MATERIALS", "PRODUCTION", "FINISHING", "QC", "PACKAGING"] as const;
export type CustomerMilestone = (typeof CUSTOMER_MILESTONES)[number];

export const templateStepInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(80),
  stepType: z.string().min(1),
  dependsOn: z.array(z.string()).default([]),
  condition: stepConditionSchema.default({ type: "ALWAYS" }),
  gate: gateSchema.nullable().default(null),
  machineType: z.string().nullable().default(null),
  defaultMinutes: z.number().int().min(0).default(0),
  /** Minimum wait after dependencies complete (e.g. ink drying before lamination). */
  minLagMinutes: z.number().int().min(0).max(7 * 24 * 60).default(0),
  isQc: z.boolean().default(false),
  /** For QC steps: which earlier steps a rejection may send the work back to. */
  reworkTargets: z.array(z.string()).default([]),
  milestone: z.enum(CUSTOMER_MILESTONES),
  checklist: z.array(z.string()).default([]),
});
export type TemplateStepInput = z.infer<typeof templateStepInputSchema>;
