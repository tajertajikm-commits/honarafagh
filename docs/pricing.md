# Pricing

Prices are computed, never typed in. The engine (`src/server/modules/pricing/engine.ts`,
`ENGINE_VERSION = 1`) is a pure function of the **product definition**, the
**customer's selections**, the **quantity**, the **urgency**, the **customer
discount** and a **published rule version**.

## Rule versions

`pricing_rule_sets` group products (one set by default). Each set has versions:

```
DRAFT ──edit──► DRAFT ──publish──► PUBLISHED ──(next publish)──► ARCHIVED
```

- There is exactly one PUBLISHED version per set (partial unique index). Published and archived versions are immutable.
- In `/panel/pricing`, a manager creates a draft from any version and edits it: markup tiers, urgency, minimum order, rounding, VAT, press parameters, finishing operations and material costs (with a JSON mode for everything else).
- The **simulator** prices any product/configuration against the draft and the published version side by side, showing the difference, cost, margin, method comparison, imposition and the cost lines. Only then does the manager publish.
- Order items and quote items store the full breakdown and the version id. Publishing never changes an existing order or a valid quote.

## Calculation

1. **Resolve the spec**: components (e.g. body/cover/inner) with leaves (fixed, or from a page-count option), trim size (default, option or custom), materials, colours, operations and flags chosen by the options.
2. **For every method valid for the quantity** (product methods with quantity ranges):
   - **Imposition**: printable area of the press sheet minus gripper/side margins. `fitCount` tries both orientations. Forms = leaves × sides ÷ ups.
   - **Offset**: plates = forms × colours. Make-ready cost per plate. Run cost per 1,000 sheets per colour (minimum run). Make-ready waste sheets per colour plus a running waste percentage. Press sheets are converted to parent stock sheets (e.g. 70×100) at their yield.
   - **Digital**: click cost per side (colour/black), setup, waste percentage with a minimum.
   - **Operations** (lamination, UV, foil, binding, cutting, packaging …) by basis: job, unit, 1,000 units, sheet, sheet side, leaf or m². Each has a setup cost, rate, per-leaf rate, minimum charge and the materials it consumes. Each carries a workflow step type and time estimate.
   - Flag fees (e.g. design service).
3. **Choose the method**: `CHEAPEST` (default) or `PRIORITY`.
4. **Sell price** = cost × (1 + markup tier for the quantity) + fees → × urgency multiplier → − customer standing discount → minimum order price → rounded **up** to `roundTo` → VAT.
5. **Outputs**: subtotal, VAT, total, unit price, cost, profit, margin, lead days (method + operations, scaled by urgency), material needs (which become reservations), step estimates (which feed the scheduler) and the operations list (which drives conditional workflow steps).

Example from the tests: 500 digital business cards cost 8,475,000 rial, sell for a
subtotal of 11,450,000 plus 1,145,000 VAT, total 12,595,000 rial.

## Quotes and manual prices

- Staff price checks (`POST /api/v1/pricing/staff-quote`) show cost and margin only to roles with `pricing.view` or `order.price.override`.
- A manual line price or a custom (off-catalogue) line on an order requires `order.price.override` and is audited. Quotes freeze prices for their validity period.
