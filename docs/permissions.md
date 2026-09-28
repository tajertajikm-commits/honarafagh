# Roles and permissions

## Model

- **Permissions** are fixed action codes (`src/server/auth/permissions.ts`, 48 codes), e.g. `order.cancel`, `inventory.issue`, `payment.approve`, `pricing.publish`, `production.override`.
- **Roles** live in the database and are editable at `/panel/employees?tab=roles`. A role has permissions, **workspaces** (which panel pages appear in its menu) and **step types** (which production tasks its members see in *My tasks* and may execute).
- An employee may hold several roles. Their effective access is the union.
- Customers are a separate actor kind. They can only reach their own orders, files, payments, quotes and addresses (checked in every service: IDOR protection).

Enforcement is **server-side in the service layer** (`assertCan`), for every
entry point: REST, server-rendered pages (`requireStaffPage` redirects to
`/panel/forbidden`) and the worker. Hiding a button in the UI is only
cosmetic. Changes to roles, overrides, discounts, price edits, forced
statuses, cancellations after production start, stock adjustments and
refunds are all written to the append-only audit log, with a reason where
one is required.

Safety rules:

- At least one active manager must always remain.
- The manager role cannot lose `role.manage`.
- Users cannot deactivate their own account.
- Deactivating an account or resetting its password revokes all of its sessions.

## Seeded roles

| Role | Workspaces | Can execute steps | Key permissions |
|---|---|---|---|
| مدیر MANAGER | all | all | all |
| فروش SALES | sales | — | orders (view/create/edit), quotes, customers, file upload, pricing view |
| حسابدار ACCOUNTANT | accounting | — | payments view/create/approve/refund, reports |
| تأمین PROCUREMENT | procurement, warehouse | — | procurement manage, receive goods |
| انباردار WAREHOUSE | warehouse | — | inventory view/receive/issue/reserve/waste |
| طراح DESIGNER | studio | DESIGN | file upload, execute |
| پیش از چاپ PREPRESS | studio, station | PREPRESS | file review (approve for print) |
| لیتوگرافی LITHOGRAPHY | station | PLATE_MAKING | execute |
| اپراتور افست / دیجیتال | station | OFFSET_PRINTING / DIGITAL_PRINTING, PLOTTER_CUTTING | execute |
| برش، سلفون، UV، تکمیلی، صحافی، بسته‌بندی | station | their step types | execute |
| کنترل کیفیت QC | qc | QC | `qc.perform` |
| ارسال SHIPPING | shipping | — | delivery view/manage/execute |

Operators only see and act on tasks whose step type is in one of their roles.
Starting a task also checks machine availability, one running job per
operator, holds and drying lags.

## Overrides (manager / `production.override`, `order.*`)

- Force-complete a gate (file, material, payment).
- Start before the drying lag ends.
- Skip, cancel or reopen a step.
- Cancel an order after production has started.
- Change price or discount.
- Remove the payment gate (deposit, and settlement before delivery).
- Force an order status.

Each one requires a written reason and creates an audit entry.
