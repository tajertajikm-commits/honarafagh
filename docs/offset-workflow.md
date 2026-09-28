# Offset workflow (گردش‌کار افست)

Source: the owner's flowchart (`docs/assets/offset-order-flowchart.mermaid`).
It was analysed, then modelled as a DAG with explicit gates, parallel branches,
conditional steps and exception paths. It was **not** copied one-to-one.

## Flowchart analysis

| Flowchart | Observation | Platform decision |
|---|---|---|
| A→B quote → order | Commercial steps, not production | Handled by the quote and order modules (inquiry → quote with a price snapshot → accept → order), outside the production DAG |
| C, D, E, F: file → design? → final approval | Correct, but "final approval" is a *state* that depends on the customer and prepress, not a task someone does | `DESIGN` is conditional on flag `NEEDS_DESIGN`. `FILE_APPROVAL` is a **gate** that completes when an artwork version is `APPROVED_FOR_PRINT` (technical review plus customer proof approval) |
| G1/G2/G3 in parallel, then H "everything ready? wait" | Good parallelism. The self-loop "wait" is really a synchronisation barrier on other domains | `PREPRESS` (task) runs in parallel with the `PAPER` and `PLATE_STOCK` **material gates**. They are satisfied by reservations or goods receipts. Waiting is visible (procurement status, shortage requests, PO expected date feeding the schedule) instead of a loop |
| — | Missing: the deposit/credit check before consuming plates and press time | Added `PAYMENT` gate (deposit % per order, manager override audited) before plate making |
| — | Missing: plate making (CTP) and cutting paper to press size as work steps | Added `PLATE_MAKING` (CTP machine) and `PAPER_CUTTING` (guillotine) |
| I "enter production queue" | A queue is not a step | Implicit: the print task becomes `READY` and the scheduler places it on the press |
| J, K print → QC print, reject → J | Correct loop, but a plate defect should also be allowed to go back to plate making | `PRINT_QC` rework targets: `PRINTING`, `PLATE_MAKING` |
| L1/L2 lamination? | Correct as a condition. Missing: ink must dry first | `LAMINATION` is `IF_OPERATION(LAMINATION)` with a **4-hour minimum lag** after print QC |
| M cutting → N1/N2 UV **after cutting** | **Questionable order.** Spot/flood UV is normally applied to full press sheets *before* final trimming (registration needs sheet margins, cut pieces are hard to feed). The flowchart puts UV after cutting | Implemented **as in the flowchart** (the owner's shop may use a small-format UV unit), but it's flagged here for the owner. Swapping it in the workflow editor is a one-minute change |
| N3/N4 other finishing (foil, emboss, die-cut) | Grouped as one step | Split into separate conditional steps (`FOIL`, `EMBOSS`, `DIE_CUT`, `CORNERS`) with their own machines, times and costs |
| N5/O binding? | Correct as a condition | `BINDING` is `IF_OPERATION(BINDING)` |
| P, Q final QC → rework → J | Rework always returns to printing, which is wasteful when only cutting or binding failed | `FINAL_QC` rework targets: printing, lamination, cutting, UV or binding. QC chooses, and only the steps from there onward are redone (new attempts) |
| R packaging → S ready → T ship → U settle → V close | Delivery and settlement are separate domains | `PACKAGING` ends production. Ready, shipping, delivery and settlement are the delivery and payment domains. The order completes only when **delivered and paid**. A configurable rule blocks goods leaving with a balance, unless the manager overrides it or the customer's credit limit covers it |

### Exception states the flowchart did not cover (now handled)

- Customer rejects the proof: a new design attempt, with the reason recorded.
- Technical rejection of an uploaded file: the file needs correction and the customer is notified.
- Material shortage: partial reservation, an automatic purchase request, a PO with an expected date the schedule respects, and automatic allocation on receipt.
- Machine breakdown or maintenance: blocking issue, machine status, maintenance windows excluded from capacity.
- Order on hold or cancelled, including a manager override after production has started. Reservations are released.
- Partial production and partial delivery. Shortfalls are recorded.
- Payment rejected or refunded, and overpayment (refund queue).
- Change requests after confirmation (approve or reject, audited).

## Steps (seed template `OFFSET_STANDARD`)

```
DESIGN? ─► FILE_APPROVAL▣ ─► PREPRESS ─┐
PAYMENT▣ ──────────────────────────────┼─► PLATE_MAKING ─┐
PLATE_STOCK▣ ──────────────────────────┘                 ├─► PRINTING ─► PRINT_QC ─► LAMINATION? (4h lag)
PAPER▣ ─► PAPER_CUTTING ─────────────────────────────────┘
  ─► CUTTING? ─► UV? ─► FOIL? ─► EMBOSS? ─► DIE_CUT? ─► CORNERS? ─► BINDING? ─► FINAL_QC ─► PACKAGING
▣ = automatic gate, ? = conditional on the ordered operation/flag
```
