import { sql } from "drizzle-orm";
import { type Ctx, assertCan } from "@/server/core/context";
import { workCalendar } from "@/server/modules/settings/service";

/**
 * Management reports. All figures are computed from operational records
 * (orders, payments, ledger, time logs); nothing is stored twice.
 * Money is rial; the UI converts to toman.
 */
export interface Range { from: Date; to: Date }

export function rangeFromDays(days: number, now = new Date()): Range {
  return { from: new Date(now.getTime() - days * 86_400_000), to: now };
}

const rows = <T>(r: { rows: unknown[] }) => r.rows as T[];
const n = (v: unknown) => Number(v ?? 0);

export async function salesReport(ctx: Ctx, r: Range) {
  assertCan(ctx, "report.view");
  const [totals] = rows<{ orders: number; revenue: number; cancelled: number }>(await ctx.db.execute(sql`
    SELECT count(*) FILTER (WHERE status <> 'CANCELLED')::int AS orders,
           coalesce(sum(total) FILTER (WHERE status <> 'CANCELLED'), 0)::float AS revenue,
           count(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
    FROM orders WHERE placed_at BETWEEN ${r.from} AND ${r.to} AND status <> 'PENDING_REVIEW'`));
  const byDay = rows<{ day: string; revenue: number }>(await ctx.db.execute(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day, coalesce(sum(o.total), 0)::float AS revenue
    FROM generate_series((${r.from}::timestamptz AT TIME ZONE 'Asia/Tehran')::date, (${r.to}::timestamptz AT TIME ZONE 'Asia/Tehran')::date, interval '1 day') d(day)
    LEFT JOIN orders o ON (o.placed_at AT TIME ZONE 'Asia/Tehran')::date = d.day AND o.status NOT IN ('CANCELLED','PENDING_REVIEW')
    GROUP BY d.day ORDER BY d.day`));
  const byProduct = rows<{ name: string; qty: number; revenue: number; cost: number }>(await ctx.db.execute(sql`
    SELECT coalesce(p.name, i.title) AS name, sum(i.quantity)::float AS qty, sum(i.line_subtotal)::float AS revenue, sum(i.cost_total)::float AS cost
    FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id
    WHERE o.placed_at BETWEEN ${r.from} AND ${r.to} AND o.status NOT IN ('CANCELLED','PENDING_REVIEW') AND i.status = 'ACTIVE'
    GROUP BY 1 ORDER BY revenue DESC LIMIT 12`));
  const bySource = rows<{ source: string; orders: number; revenue: number }>(await ctx.db.execute(sql`
    SELECT source::text, count(*)::int AS orders, sum(total)::float AS revenue FROM orders
    WHERE placed_at BETWEEN ${r.from} AND ${r.to} AND status NOT IN ('CANCELLED','PENDING_REVIEW') GROUP BY source ORDER BY revenue DESC`));
  const byMethod = rows<{ method: string; items: number; revenue: number }>(await ctx.db.execute(sql`
    SELECT coalesce(i.production_method, 'CUSTOM') AS method, count(*)::int AS items, sum(i.line_subtotal)::float AS revenue
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.placed_at BETWEEN ${r.from} AND ${r.to} AND o.status NOT IN ('CANCELLED','PENDING_REVIEW') AND i.status = 'ACTIVE' GROUP BY 1`));
  const topCustomers = rows<{ name: string; orders: number; revenue: number }>(await ctx.db.execute(sql`
    SELECT c.full_name AS name, count(*)::int AS orders, sum(o.total)::float AS revenue FROM orders o JOIN customers c ON c.id = o.customer_id
    WHERE o.placed_at BETWEEN ${r.from} AND ${r.to} AND o.status NOT IN ('CANCELLED','PENDING_REVIEW') GROUP BY c.full_name ORDER BY revenue DESC LIMIT 8`));
  const orders = n(totals?.orders);
  return { orders, revenue: n(totals?.revenue), cancelled: n(totals?.cancelled), avgOrder: orders ? n(totals?.revenue) / orders : 0, byDay, byProduct, bySource, byMethod, topCustomers };
}

export async function financeReport(ctx: Ctx, r: Range) {
  assertCan(ctx, "report.view");
  const byMethod = rows<{ method: string; kind: string; amount: number; count: number }>(await ctx.db.execute(sql`
    SELECT method::text, kind::text, sum(amount)::float AS amount, count(*)::int AS count FROM payments
    WHERE status = 'CONFIRMED' AND confirmed_at BETWEEN ${r.from} AND ${r.to} GROUP BY method, kind`));
  const aging = rows<{ bucket: string; amount: number; orders: number }>(await ctx.db.execute(sql`
    SELECT CASE WHEN now() - placed_at <= interval '7 days' THEN '0-7'
                WHEN now() - placed_at <= interval '30 days' THEN '8-30'
                WHEN now() - placed_at <= interval '60 days' THEN '31-60' ELSE '60+' END AS bucket,
           sum(total - (paid_amount - refunded_amount))::float AS amount, count(*)::int AS orders
    FROM orders WHERE status NOT IN ('CANCELLED','PENDING_REVIEW') AND total - (paid_amount - refunded_amount) > 0 GROUP BY 1`));
  const collected = byMethod.filter((m) => m.kind === "PAYMENT").reduce((s, m) => s + n(m.amount), 0);
  const refunded = byMethod.filter((m) => m.kind === "REFUND").reduce((s, m) => s + n(m.amount), 0);
  const [margin] = rows<{ revenue: number; cost: number }>(await ctx.db.execute(sql`
    SELECT coalesce(sum(i.line_subtotal), 0)::float AS revenue, coalesce(sum(i.cost_total), 0)::float AS cost
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.status = 'COMPLETED' AND o.completed_at BETWEEN ${r.from} AND ${r.to} AND i.status = 'ACTIVE'`));
  return { byMethod, aging, collected, refunded, completedRevenue: n(margin?.revenue), completedCost: n(margin?.cost) };
}

export async function productionReport(ctx: Ctx, r: Range) {
  assertCan(ctx, "report.view");
  const bySteps = rows<{ step: string; name: string; completed: number; planned: number; actual: number; rework: number }>(await ctx.db.execute(sql`
    SELECT t.step_type_code AS step, st.name, count(*)::int AS completed,
           coalesce(sum(t.estimated_minutes), 0)::float AS planned,
           coalesce(sum((SELECT sum(extract(epoch FROM (coalesce(l.ended_at, now()) - l.started_at)) / 60) FROM task_time_logs l WHERE l.task_id = t.id)), 0)::float AS actual,
           count(*) FILTER (WHERE t.attempt > 1)::int AS rework
    FROM production_tasks t JOIN step_types st ON st.code = t.step_type_code
    WHERE t.status = 'COMPLETED' AND t.completed_at BETWEEN ${r.from} AND ${r.to} AND t.gate IS NULL
    GROUP BY t.step_type_code, st.name, st.sort_order ORDER BY st.sort_order`));
  const [delivery] = rows<{ done: number; on_time: number; avg_days: number }>(await ctx.db.execute(sql`
    SELECT count(*)::int AS done, count(*) FILTER (WHERE due_date IS NULL OR ready_at <= due_date)::int AS on_time,
           coalesce(avg(extract(epoch FROM (ready_at - placed_at)) / 86400), 0)::float AS avg_days
    FROM orders WHERE ready_at BETWEEN ${r.from} AND ${r.to}`));
  const issues = rows<{ type: string; count: number; open: number }>(await ctx.db.execute(sql`
    SELECT type::text, count(*)::int AS count, count(*) FILTER (WHERE status = 'OPEN')::int AS open FROM production_issues
    WHERE created_at BETWEEN ${r.from} AND ${r.to} GROUP BY type ORDER BY count DESC`));
  const qc = rows<{ result: string; count: number; checked: number; rejected: number }>(await ctx.db.execute(sql`
    SELECT result::text, count(*)::int AS count, sum(quantity_checked)::float AS checked, sum(quantity_rejected)::float AS rejected FROM qc_inspections
    WHERE created_at BETWEEN ${r.from} AND ${r.to} GROUP BY result`));
  return { bySteps, delivered: n(delivery?.done), onTime: n(delivery?.on_time), avgLeadDays: n(delivery?.avg_days), issues, qc };
}

export async function wasteReport(ctx: Ctx, r: Range) {
  assertCan(ctx, "report.view");
  const byMaterial = rows<{ name: string; unit: string; qty: number; value: number; consumed: number }>(await ctx.db.execute(sql`
    SELECT m.name, m.unit, sum(t.quantity) FILTER (WHERE t.type = 'WASTE')::float AS qty,
           sum(t.quantity * coalesce(t.unit_cost, m.standard_cost)) FILTER (WHERE t.type = 'WASTE')::float AS value,
           coalesce(sum(t.quantity) FILTER (WHERE t.type = 'CONSUME'), 0)::float AS consumed
    FROM inventory_transactions t JOIN materials m ON m.id = t.material_id
    WHERE t.created_at BETWEEN ${r.from} AND ${r.to} AND t.type IN ('WASTE','CONSUME')
    GROUP BY m.name, m.unit HAVING sum(t.quantity) FILTER (WHERE t.type = 'WASTE') > 0 ORDER BY value DESC NULLS LAST`));
  const byStep = rows<{ step: string; qty: number; value: number }>(await ctx.db.execute(sql`
    SELECT coalesce(st.name, 'انبار') AS step, sum(t.quantity)::float AS qty, sum(t.quantity * coalesce(t.unit_cost, m.standard_cost))::float AS value
    FROM inventory_transactions t JOIN materials m ON m.id = t.material_id
    LEFT JOIN production_tasks pt ON pt.id = t.task_id LEFT JOIN step_types st ON st.code = pt.step_type_code
    WHERE t.type = 'WASTE' AND t.created_at BETWEEN ${r.from} AND ${r.to} GROUP BY 1 ORDER BY value DESC`));
  const defects = rows<{ name: string; qty: number; count: number }>(await ctx.db.execute(sql`
    SELECT coalesce(dt.name, d.defect_code) AS name, sum(d.quantity)::float AS qty, count(*)::int AS count
    FROM qc_defects d JOIN qc_inspections i ON i.id = d.inspection_id LEFT JOIN qc_defect_types dt ON dt.code = d.defect_code
    WHERE i.created_at BETWEEN ${r.from} AND ${r.to} GROUP BY 1 ORDER BY qty DESC`));
  return { byMaterial, byStep, defects, totalValue: byMaterial.reduce((s, m) => s + n(m.value), 0) };
}

export async function inventoryReport(ctx: Ctx, r: Range) {
  assertCan(ctx, "report.view");
  const byCategory = rows<{ name: string; value: number; reserved: number }>(await ctx.db.execute(sql`
    SELECT c.name, coalesce(sum(s.on_hand * m.standard_cost), 0)::float AS value, coalesce(sum(s.reserved * m.standard_cost), 0)::float AS reserved
    FROM material_categories c JOIN materials m ON m.category_code = c.code LEFT JOIN stock_levels s ON s.material_id = m.id
    GROUP BY c.name, c.sort_order ORDER BY c.sort_order`));
  const consumption = rows<{ name: string; unit: string; qty: number; value: number }>(await ctx.db.execute(sql`
    SELECT m.name, m.unit, sum(t.quantity)::float AS qty, sum(t.quantity * coalesce(t.unit_cost, m.standard_cost))::float AS value
    FROM inventory_transactions t JOIN materials m ON m.id = t.material_id
    WHERE t.type = 'CONSUME' AND t.created_at BETWEEN ${r.from} AND ${r.to} GROUP BY m.name, m.unit ORDER BY value DESC LIMIT 12`));
  const movements = rows<{ type: string; count: number }>(await ctx.db.execute(sql`
    SELECT type::text, count(*)::int AS count FROM inventory_transactions WHERE created_at BETWEEN ${r.from} AND ${r.to} GROUP BY type`));
  return { byCategory, consumption, movements, totalValue: byCategory.reduce((s, c) => s + n(c.value), 0) };
}

/** Available minutes per machine in the range, from the configured work calendar. */
async function availableMinutes(ctx: Ctx, r: Range) {
  const cal = await workCalendar(ctx.db);
  let minutes = 0;
  for (let t = r.from.getTime(); t < r.to.getTime(); t += 86_400_000) {
    const tehran = new Date(t + 210 * 60_000);
    const dow = tehran.getUTCDay();
    if (!cal.workdays.includes(dow)) continue;
    const span = cal.endMinute - cal.startMinute;
    minutes += dow === 4 && cal.thursdayHalf ? span / 2 : span;
  }
  return minutes;
}

export async function machinesReport(ctx: Ctx, r: Range) {
  assertCan(ctx, "report.view");
  const avail = await availableMinutes(ctx, r);
  const list = rows<{ id: string; name: string; code: string; minutes: number; tasks: number; maintenance: number }>(await ctx.db.execute(sql`
    SELECT m.id, m.name, m.code,
      coalesce((SELECT sum(extract(epoch FROM (least(coalesce(l.ended_at, now()), ${r.to}::timestamptz) - greatest(l.started_at, ${r.from}::timestamptz))) / 60)
                FROM task_time_logs l WHERE l.machine_id = m.id AND l.started_at < ${r.to} AND coalesce(l.ended_at, now()) > ${r.from}), 0)::float AS minutes,
      (SELECT count(*) FROM production_tasks t WHERE t.machine_id = m.id AND t.status = 'COMPLETED' AND t.completed_at BETWEEN ${r.from} AND ${r.to})::int AS tasks,
      coalesce((SELECT sum(extract(epoch FROM (coalesce(mm.completed_at, mm.scheduled_end) - coalesce(mm.started_at, mm.scheduled_start))) / 60)
                FROM machine_maintenance mm WHERE mm.machine_id = m.id AND mm.status <> 'CANCELLED' AND coalesce(mm.started_at, mm.scheduled_start) BETWEEN ${r.from} AND ${r.to}), 0)::float AS maintenance
    FROM machines m WHERE m.is_active ORDER BY m.type_code, m.code`));
  return { available: avail, machines: list.map((m) => ({ ...m, utilization: avail ? Math.min(1, n(m.minutes) / avail) : 0 })) };
}

export async function employeesReport(ctx: Ctx, r: Range) {
  assertCan(ctx, "report.view");
  return rows<{ name: string; title: string | null; minutes: number; tasks: number; hourly: number }>(await ctx.db.execute(sql`
    SELECT u.full_name AS name, e.title,
      coalesce((SELECT sum(extract(epoch FROM (coalesce(l.ended_at, now()) - l.started_at)) / 60) FROM task_time_logs l WHERE l.employee_id = e.id AND l.started_at BETWEEN ${r.from} AND ${r.to}), 0)::float AS minutes,
      (SELECT count(*) FROM production_tasks t WHERE t.assignee_id = e.id AND t.status = 'COMPLETED' AND t.completed_at BETWEEN ${r.from} AND ${r.to})::int AS tasks,
      e.hourly_cost::float AS hourly
    FROM employees e JOIN users u ON u.id = e.user_id WHERE e.is_active ORDER BY minutes DESC`));
}

export async function procurementReport(ctx: Ctx, r: Range) {
  assertCan(ctx, "report.view");
  const suppliers = rows<{ name: string; orders: number; value: number; received: number; on_time: number; avg_days: number | null }>(await ctx.db.execute(sql`
    SELECT s.name, count(p.id)::int AS orders, coalesce(sum(p.total_amount), 0)::float AS value,
      count(p.id) FILTER (WHERE p.status = 'RECEIVED')::int AS received,
      count(p.id) FILTER (WHERE p.status = 'RECEIVED' AND (p.expected_at IS NULL OR (SELECT max(g.created_at) FROM goods_receipts g WHERE g.purchase_order_id = p.id) <= p.expected_at + interval '1 day'))::int AS on_time,
      avg(extract(epoch FROM ((SELECT max(g.created_at) FROM goods_receipts g WHERE g.purchase_order_id = p.id) - p.ordered_at)) / 86400) FILTER (WHERE p.status = 'RECEIVED')::float AS avg_days
    FROM suppliers s JOIN purchase_orders p ON p.supplier_id = s.id
    WHERE p.status <> 'CANCELLED' AND p.created_at BETWEEN ${r.from} AND ${r.to}
    GROUP BY s.name ORDER BY value DESC`));
  const [requests] = rows<{ total: number; shortage: number; open: number }>(await ctx.db.execute(sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE reason = 'SHORTAGE')::int AS shortage, count(*) FILTER (WHERE status = 'OPEN')::int AS open
    FROM material_requests WHERE created_at BETWEEN ${r.from} AND ${r.to}`));
  return { suppliers, requests: { total: n(requests?.total), shortage: n(requests?.shortage), open: n(requests?.open) } };
}
