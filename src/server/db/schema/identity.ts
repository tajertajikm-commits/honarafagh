import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { customerType, sessionKind, userKind } from "./enums";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
export { timestamps };

/** A login identity. Phone numbers are stored normalized as 09xxxxxxxxx. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 11 }).notNull(),
    fullName: text("full_name").notNull().default(""),
    email: text("email"),
    passwordHash: text("password_hash"),
    kind: userKind("kind").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_phone_kind_uq").on(t.phone, t.kind),
    check("users_phone_format", sql`${t.phone} ~ '^09[0-9]{9}$'`),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    phone: varchar("phone", { length: 11 }).notNull(),
    fullName: text("full_name").notNull(),
    type: customerType("type").notNull().default("INDIVIDUAL"),
    companyName: text("company_name"),
    nationalId: varchar("national_id", { length: 11 }),
    economicCode: varchar("economic_code", { length: 16 }),
    email: text("email"),
    /** Standing discount percentage applied by the pricing engine (0–100). */
    discountPct: numeric("discount_pct", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    creditLimit: bigint("credit_limit", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("customers_phone_uq").on(t.phone),
    uniqueIndex("customers_user_uq").on(t.userId),
    index("customers_name_trgm").using("gin", sql`${t.fullName} gin_trgm_ops`),
    check("customers_discount_range", sql`${t.discountPct} >= 0 AND ${t.discountPct} <= 100`),
  ],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    province: text("province").notNull(),
    city: text("city").notNull(),
    line: text("line").notNull(),
    postalCode: varchar("postal_code", { length: 10 }),
    recipientName: text("recipient_name").notNull(),
    recipientPhone: varchar("recipient_phone", { length: 11 }).notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("addresses_customer_idx").on(t.customerId)],
);

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    personnelCode: varchar("personnel_code", { length: 16 }).notNull(),
    title: text("title"),
    /** Loaded labour cost per hour in rial, used by costing reports. */
    hourlyCost: bigint("hourly_cost", { mode: "number" }).notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("employees_user_uq").on(t.userId), uniqueIndex("employees_code_uq").on(t.personnelCode)],
);

/**
 * Roles are data, not code. A role grants permissions (backend-enforced actions),
 * workspaces (which UI surfaces the employee sees) and step capabilities
 * (which production step types the employee can pick up).
 */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 48 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(false),
    workspaces: text("workspaces").array().notNull().default(sql`'{}'::text[]`),
    stepTypes: text("step_types").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_code_uq").on(t.code)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: varchar("permission", { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);

export const employeeRoles = pgTable(
  "employee_roles",
  {
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.employeeId, t.roleId] })],
);

/** Opaque session tokens; only the SHA-256 hash is stored. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: sessionKind("kind").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: varchar("ip", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_uq").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const otpChallenges = pgTable(
  "otp_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 11 }).notNull(),
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("otp_phone_idx").on(t.phone, t.createdAt)],
);

/** Fixed-window counters shared by all app instances (auth endpoints, OTP). */
export const rateLimits = pgTable("rate_limits", {
  key: varchar("key", { length: 160 }).primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
