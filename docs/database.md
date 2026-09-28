# Database

PostgreSQL 16. The schema lives in `src/server/db/schema/*.ts` (Drizzle) and the SQL
migrations in `drizzle/`:

| Migration | Content |
|---|---|
| `0000_extensions.sql` | `pg_trgm` (fuzzy Persian search) |
| `0001_schema.sql` | Tables, enums, indexes, constraints |
| `0002_integrity.sql` | Append-only triggers, trigram indexes |
| `0003_vat_pct.sql` | Per-order/per-quote VAT rate |
| `0004_notification_outbox_ref.sql` | Notification ↔ outbox event link |

Money is stored as integer **rial** (`bigint`), and quantities as `numeric(14,3)`.
All timestamps are `timestamptz`, and business days are computed in Asia/Tehran.

## Domains and main tables

**Identity & access**: `users` (unique phone per kind), `customers`, `addresses`,
`employees`, `roles` (workspaces[], stepTypes[]), `role_permissions`,
`employee_roles`, `sessions` (token hash), `otp_challenges`, `rate_limits`,
`app_settings`.

**Catalog & rules**: `product_categories`, `products` (spec JSON validated by Zod),
`product_images`, `product_methods` (method + workflow + quantity range),
`product_option_groups`, `product_option_values` (effects JSON),
`production_methods`, `machine_types`, `step_types`, `pricing_rule_sets`,
`pricing_rule_versions` (DRAFT/PUBLISHED/ARCHIVED, **one PUBLISHED per set**
via partial unique index), `workflow_templates` (versioned by code),
`workflow_template_steps`.

**Sales & orders**: `inquiries`, `quotes`, `quote_items` (price snapshot),
`carts`, `cart_items`, `orders` (all state domains, totals, VAT, deposit %,
payment-gate override, `idempotency_key` unique, optimistic `version`),
`order_items` (price snapshot, workflow code, production method, produced and
delivered quantity), `order_events` (timeline), `order_change_requests`.

**Files**: `file_objects` (storage key, sniffed MIME, size, SHA-256),
`entity_files`, `artwork_versions` (versioned; partial unique index ⇒ at most one
`APPROVED_FOR_PRINT` per item).

**Production**: `production_jobs` (one per item), `production_tasks`
(`unique(job, step_key, attempt)`: rework = new attempt), `task_time_logs`
(at most one open log per task), `task_events`, `production_issues`,
`qc_defect_types`, `qc_inspections`, `qc_defects`, `machines`,
`machine_maintenance`.

**Inventory & procurement**: `material_categories`, `warehouse_locations`,
`suppliers`, `materials`, `stock_levels` (PK material+location; `available`
generated; CHECK `on_hand ≥ 0`, `reserved ≥ 0`, `reserved ≤ on_hand`),
`material_requirements` (CHECK consumed + wasted + returned ≤ issued),
`inventory_transactions` (**append-only**, idempotency key unique),
`material_requests` (one open shortage request per requirement),
`purchase_orders`, `purchase_order_lines`, `goods_receipts`.

**Finance & delivery**: `payments` (unique provider authority / ref id /
idempotency key; amount > 0), `delivery_methods`, `vehicles`, `shipments`,
`shipment_items`.

**Platform**: `outbox_events`, `notification_templates`, `notifications`
(dedupe key unique), `audit_logs` (**append-only**), `integration_links`
(external ids for accounting sync).

## Integrity rules enforced by the database

- `inventory_transactions` and `audit_logs` reject `UPDATE`/`DELETE` (trigger `forbid_mutation`).
- Stock can never go negative or be over-reserved (CHECK constraints), even under concurrent requests.
- One published pricing version per rule set; one approved-for-print artwork per item; one open shortage request per requirement; one open time log per task.
- Document numbers come from sequences (`order_number_seq` from 100001, `doc_number_seq` from 1001), so they are gap-tolerant and race-free.
- Idempotency keys (checkout, manual payments, receipts, issues) are unique, so a retried request cannot double-post.

## Snapshots and versioning

- Each order item and quote item stores the full `PriceBreakdown` and the pricing version id it was priced with. Publishing new rules never changes existing orders or valid quotes.
- Each production job references the workflow template **version** it was created from. Activating a new version only affects new items.
- Product edits don't affect existing orders; order items carry their own selections and snapshot.
