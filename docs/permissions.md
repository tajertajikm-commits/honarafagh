# Roles and permissions

Permissions are the only authority (`src/server/auth/permissions.ts`). Roles are named bundles
editable in `/panel/employees`. Every service checks permissions itself; pages and nav only hide.

| Person (demo phone) | Role | Key permissions |
|---|---|---|
| Hamed Noorsalehi `09120000001` | Manager | everything, incl. `offset.paper.approve`, `offset.quality`, `dashboard.view` |
| Labafi `…02` | Digital manager | `order.approve.digital`, `order.priority`, `artwork.review`, `digital.*` |
| Azad `…03` | Digital operator | `digital.queue`, `digital.production` |
| Hossein Abdali `…04` | Accountant | `order.approve.offset`, `order.price`, `offset.queue`, `customer.*`, `payment.*`, `invoice.manage` |
| Gholipour `…05` | Litho & offset manager | `order.approve.offset`, `order.priority`, `offset.litho`, `offset.paper`, `offset.press.assign`, `offset.postpress`, `offset.shipping`, `inventory.manage` |
| Mojtaba Hajghasemi `…06` | Offset production | `offset.press.assign`, `offset.print`, `offset.postpress`, `offset.packaging`, `offset.shipping` |
| Memarian `…07` | Designer | `design.work`, `artwork.review` |

Demo staff password: `honar1405` (`SEED_STAFF_PASSWORD`). Phones and names are placeholders. Replace them with the real ones before go-live.

Order visibility: `order.view`, or the approve/queue permission of the order's type, or
`design.work` for orders that need design, or `payment.view`/`invoice.manage`. Customers see only their own orders, files and invoices.

Landing page: `dashboard.view` → control center; everyone else → «کارهای من» (only their own actionable items, with counts).
