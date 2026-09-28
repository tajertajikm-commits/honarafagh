# Workflow engine

Workflows are **data** (`workflow_templates` + `workflow_template_steps`),
versioned per code and edited in the panel (`/panel/workflows`). The engine is
generic; Offset and Digital are two separate templates.

## Step definition

| Field | Meaning |
|---|---|
| `key`, `name`, `stepType` | Identity; the step type decides which roles see it in *My tasks* |
| `dependsOn[]` | Steps that must be complete first. Several steps with satisfied dependencies run **in parallel** |
| `condition` | `ALWAYS`, `IF_OPERATION(stepType)`, `IF_FLAG(flag)`, `IF_NOT_FLAG(flag)`, or nested `ANY` / `ALL` |
| `gate` | System step: `FILE_APPROVAL`, `MATERIAL(purposes)`, `PAYMENT`. It completes automatically when the other domain is satisfied (managers can override, audited) |
| `machineType`, `defaultMinutes` | Capacity scheduling and machine assignment |
| `minLagMinutes` | Minimum wait after dependencies (e.g. ink drying before lamination) |
| `isQc`, `reworkTargets[]` | QC steps and the earlier steps a rejection may send work back to |
| `milestone` | The customer-facing timeline stage (file, materials, printing, finishing, QC, packaging) |
| `checklist[]` | Shown at the station and on QC |

## Instantiation (`planTasks`)

When an order item is released to production:

1. Conditions are evaluated against the priced spec (operations chosen by the customer, flags such as `NEEDS_DESIGN`).
2. Excluded steps are **pruned**, and their dependents inherit their dependencies transitively. If lamination is not ordered, cutting depends directly on print QC.
3. Tasks are created with estimated minutes from the pricing engine's step estimates (falling back to template defaults).

`validateTemplate` rejects duplicate keys, unknown or self dependencies,
cycles, QC steps without rework targets, rework targets that are not upstream,
conditional gates, and templates without a start step.

## Runtime (`refreshJob`)

- **Ready**: all dependencies (latest attempt) are complete and the drying lag has elapsed.
- **Gates** re-evaluate on every change in files, materials and payments. If materials are released again, a completed material gate is demoted.
- **Start** is guarded against: the order being on hold, drying not yet elapsed (manager can force, audited), the machine being busy, and the operator already running another job.
- **Pause/resume/block/issue** use time logs and issues. Blocking issues show up on the control center.
- **Consumption and waste** are recorded at completion. Operation supplies not reported explicitly are back-flushed. Paper is always reported by the operator so leftover sheets can be returned to stock.
- **QC fail** creates new attempts for every step from the rework target up to the QC step, so the work flows back through QC.
- **Skip / cancel / reopen / reassign** require `production.override` or `production.assign` and are audited.
- The job completes when every step's latest attempt is complete or skipped. The item's production status and the order's derived statuses update in the same transaction.

## Editing

Drafts are created from any version, edited in the form or as JSON,
validated on the server, and activated. Running jobs keep their version.
