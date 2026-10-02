# Database

PostgreSQL 16. The schema lives in `src/server/db/schema/*.ts` (Drizzle) and the SQL
migrations in `drizzle/`:

| Migration | Content |
|---|---|
| `0000_schema.sql` | Tables, enums, sequences, indexes, constraints |
| `0001_integrity.sql` | Append-only triggers (`audit_logs`, `stock_movements`) |

Money is stored as integer **rial** (`bigint`), and quantities as `numeric(14,3)`.
All timestamps are `timestamptz`, and business days are computed in Asia/Tehran.

## Domains and main tables

**Identity & access**: `users`, `customers` (`code` from `customer_code_seq`, `order_seq`, legal fields for official invoices), `addresses`, `employees`, `roles`, `role_permissions`, `employee_roles`, `sessions`, `otp_challenges`, `rate_limits`, `app_settings`.

**Catalog & pricing** (store): `product_categories`, `products`, `product_images`, `product_methods` (DIGITAL/OFFSET + quantity range), `product_option_groups`, `product_option_values`, `pricing_rule_sets`, `pricing_rule_versions` (one PUBLISHED per set).

**Orders**: `carts`, `cart_items`, `orders` (code, kind, production type, status, payment status, artwork status, job spec, priority, totals, timestamps), `order_items` (price snapshot), `order_events` (timeline), `order_approvals` (decision + selected stations), `artwork_files`, `file_objects`.

**Production**: `production_steps` (unique order+station key; phase, status, assignee, machine, rework count, data), `quality_approvals`, `priority_changes`, `machines`, `materials`, `stock_movements` (append-only), `suppliers`, `supplier_quotes`, `procurement_decisions`, `lithography_jobs`.

**Finance & shipping**: `payments`, `invoices` (immutable JSON snapshot of seller, buyer, lines and totals; `invoice_number_seq`), `delivery_methods`, `shipments`.

**Platform**: `outbox_events`, `notification_templates`, `notifications`, `audit_logs` (append-only), `integration_links`.

## Integrity rules

- `audit_logs` and `stock_movements` reject `UPDATE`/`DELETE`.
- Order codes come from an atomic per-customer counter; customer and invoice numbers from sequences.
- Idempotency keys on checkout, custom orders and payments are unique.
- Store order lines keep their price snapshot; invoices keep a full snapshot, so later edits to customers, settings or prices never change an issued invoice.
