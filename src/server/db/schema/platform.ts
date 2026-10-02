import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { notificationAudience, notificationChannel, notificationStatus, outboxStatus } from "./enums";
import { users } from "./identity";

/**
 * Transactional outbox: domain events are written in the same transaction
 * as the state change, then dispatched by the worker (notifications,
 * accounting sync, …) with retries.
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: varchar("type", { length: 64 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 32 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: outboxStatus("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_pending_idx").on(t.status, t.availableAt)],
);

export const notificationTemplates = pgTable(
  "notification_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    channel: notificationChannel("channel").notNull(),
    audience: notificationAudience("audience").notNull(),
    /** STAFF audience: everyone holding this permission (e.g. order.approve.digital). */
    permission: varchar("permission", { length: 48 }),
    title: text("title").notNull(),
    /** Mustache-style {{var}} placeholders; values are escaped plain text. */
    body: text("body").notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("notification_templates_event_idx").on(t.eventType)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    phone: varchar("phone", { length: 11 }),
    channel: notificationChannel("channel").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    status: notificationStatus("status").notNull().default("PENDING"),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** `${outboxEventId}:${channel}:${recipient}` — makes dispatch idempotent under retries. */
    dedupeKey: varchar("dedupe_key", { length: 160 }),
    outboxEventId: integer("outbox_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_uq").on(t.dedupeKey),
  ],
);

/** Append-only. UPDATE/DELETE blocked by trigger. */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorLabel: text("actor_label").notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    context: jsonb("context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("audit_actor_idx").on(t.actorUserId, t.createdAt),
    index("audit_action_idx").on(t.action, t.createdAt),
  ],
);

/** Mapping of internal entities to external systems (e.g. Holoo). */
export const integrationLinks = pgTable(
  "integration_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 24 }).notNull(),
    entityType: varchar("entity_type", { length: 32 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    externalId: text("external_id"),
    status: varchar("status", { length: 16 }).notNull(),
    lastError: text("last_error"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("integration_links_uq").on(t.provider, t.entityType, t.entityId)],
);
