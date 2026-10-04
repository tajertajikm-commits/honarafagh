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
Pickup and customer-courier shipments count as delivered on handover. The person who handed the order to the customer is recorded: for pickup, whoever is chosen at handover; for the printing house's courier, the courier, unless someone else is named.

When an order is ready the customer gets an SMS with the printing house's phone number, and their order page and the tracking page show a «تماس با چاپخانه» button.

## Corrections during production

- **Reassigning (manager only):** a step can be handed to a named person who holds that station's permission. From then on it is theirs: it leaves the others' «کارهای من», and only that person or the manager can do it. The person gets an in-app notification. The design can be reassigned to another designer the same way.
- **Undo:** whoever recorded a step (finished it, approved quality …) can undo it, with a reason, as long as no later step has started. Undoing a paper selection puts the paper back in stock.
- **Send back (manager, or a quality rejection):** the order goes back to any step already started or done, to «طراحی مجدد» (designer queue; file-dependent steps wait for the new design) or to «اصلاح فایل توسط مشتری» (the customer is notified). The target step is redone (rework + 1) and every later step is done again. Returning a dispatched order cancels the dispatch; a delivered order cannot be returned.
- **Changing the plan (manager or approver):** stations can be added mid-job, e.g. lamination after printing, with an optional extra charge added to the order. Steps after the added station (quality, packaging …) are done again. Unfinished optional stations can be removed.
- Every correction is recorded with who, when and why: in the order history, the audit log and the work report.

## Work report (شناسنامه سفارش)

`/panel/order-report/{code}` (accountant and manager) is the order's complete A4 record:
customer and job spec, approvals with the selected stations, files and design, every station (who, when, machine, paper, rework), quality decisions, priority, offset procurement, money (lines, payments, invoices), shipping including **who handed it to the customer**, and the full history. «دانلود PDF» uses the browser's Save as PDF.

## What the customer sees

`src/lib/order-status.ts` maps the internal state onto six stages: Waiting for approval → Approved →
Preparing → Ready → Shipping → Shipped (plus Rejected / Cancelled, and an action prompt when
a file correction or a reply is needed). Stations, QC and procurement are never shown.
