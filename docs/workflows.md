# Order workflow

The business process is the source of truth. Code: `src/server/modules/workflow/`
(`stations.ts` = station catalog, `engine.ts` = state machine), `orders/`, `offset/`, `shipping/`.

## Two kinds of activity

| Kind | Origin | Production type |
|---|---|---|
| `STORE` | Store checkout (cart split per production type; priced by the pricing engine) | from the product's pricing method |
| `CUSTOM` | `/order` form (customer) or `/panel/orders/new` (staff, phone order) | chosen: `DIGITAL` **or** `OFFSET`, never both |

Codes: customer `CUS-1042` (sequence from 1001); order `D-1042-0003` / `O-1042-0004`
(a per-customer sequence shared by both types). Global search accepts either.

## 1. Approval gate (every order)

Every order starts in `WAITING_APPROVAL`. Approvers: Digital → Hamed or Labafi;
Offset → Hamed, Abdali or Gholipour (`order.approve.digital|offset`). The approver
checks the job, then **selects the stations this order needs** (required stations are
locked on). Approve / reject (reason) / ask the customer (`NEEDS_INFO`; the customer replies
with text/files). Each decision is an `order_approvals` row: who, when, decision, notes,
reason, selected stations.

## 2. Artwork

Separate state on the order: `AWAITING_FILE` → `AWAITING_REVIEW` (customer-supplied file) → `APPROVED` |
`NEEDS_CORRECTION`; or `DESIGN_REQUESTED` → `DESIGN_IN_PROGRESS` → `DESIGN_COMPLETED`
(Memarian, after approval). Stations marked `needsArtwork` (print, sheet) stay blocked until
the file is approved or the design is complete.

## 3. Stations

A step is `WAITING` until every selected step of earlier phases is `DONE`, then `READY`
(in the station's queue) → `IN_PROGRESS` → `DONE`. The order status is derived:
`APPROVED` → `IN_PRODUCTION` → `READY` (only shipping left) → `SHIPPING` → `DELIVERED`.

**Digital** (Labafi, Azad): sheet → paper/cardboard (from stock; decrements inventory) →
print → cut/die → lamination → binding → final QC (Labafi) → packaging → shipping (Labafi).

**Offset**:
1. Lithography **‖** paper procurement (same phase, parallel).
   - Lithography is outsourced and only *recorded*: Not ordered / Ordered / In progress externally / Ready / Received / Cancelled. `RECEIVED` completes the step.
   - Paper: Gholipour records several supplier quotes → Hamed (`offset.paper.approve`) chooses → Gholipour records receipt.
2. Print: Hajghasemi or Gholipour assigns a 1-, 4- or 8-colour press; Hajghasemi prints.
3. Print quality — **Hamed only, mandatory**.
4. Post-press (cut, lamination, binding) — Gholipour or Hajghasemi.
5. Final quality — **Hamed only, mandatory**.
6. Packaging (Hajghasemi) → shipping (Hajghasemi or Gholipour).

Quality rejection sends a chosen earlier step back to `READY` (rework count + 1) and resets the later phases.

## Priority

`order.priority` holders (Hamed, Labafi, Gholipour) can put an order at the front of every
queue. Each change is a `priority_changes` row (who, when, reason, optional charge; the charge
becomes an order line). Queue order: in progress → priority (by when it was set) → time ready.

## Shipping

Methods: courier, post, external carrier, customer courier, pickup. A shipment records the method,
the responsible person or carrier, the tracking code, the recipient, notes and status.
Pickup and customer-courier shipments count as delivered on handover.

## What the customer sees

`src/lib/order-status.ts` maps the internal state onto six stages: Waiting for approval → Approved →
Preparing → Ready → Shipping → Shipped (plus Rejected / Cancelled, and an action prompt when
a file correction or a reply is needed). Stations, QC and procurement are never shown.
