import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
import type { NumberConfig, OptionEffects, PricingRules, ProductSpec } from "@/server/modules/pricing/types";
import { optionType, productionType, ruleVersionStatus } from "./enums";
import { timestamps, users } from "./identity";

// ── Pricing rule sets (versioned) ───────────────────────────────────────────

export const pricingRuleSets = pgTable(
  "pricing_rule_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 48 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (t) => [uniqueIndex("pricing_rule_sets_code_uq").on(t.code)],
);

export const pricingRuleVersions = pgTable(
  "pricing_rule_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => pricingRuleSets.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: ruleVersionStatus("status").notNull().default("DRAFT"),
    data: jsonb("data").$type<PricingRules>().notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid("published_by").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("pricing_rule_versions_uq").on(t.ruleSetId, t.version),
    // Exactly one live version per rule set.
    uniqueIndex("pricing_rule_versions_one_published")
      .on(t.ruleSetId)
      .where(sql`${t.status} = 'PUBLISHED'`),
  ],
);

// ── Catalog ─────────────────────────────────────────────────────────────────

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: text("name").notNull(),
    description: text("description"),
    icon: varchar("icon", { length: 32 }),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("product_categories_slug_uq").on(t.slug)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull(),
    name: text("name").notNull(),
    subtitle: text("subtitle"),
    description: text("description"),
    categoryId: uuid("category_id").references(() => productCategories.id, { onDelete: "set null" }),
    pricingRuleSetId: uuid("pricing_rule_set_id")
      .notNull()
      .references(() => pricingRuleSets.id),
    spec: jsonb("spec").$type<ProductSpec>().notNull(),
    unitLabel: text("unit_label").notNull().default("عدد"),
    minQuantity: integer("min_quantity").notNull().default(1),
    maxQuantity: integer("max_quantity"),
    quantityStep: integer("quantity_step").notNull().default(1),
    quantityPresets: integer("quantity_presets").array().notNull().default(sql`'{}'::int[]`),
    requiresArtwork: boolean("requires_artwork").notNull().default(true),
    offersDesignService: boolean("offers_design_service").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    highlights: jsonb("highlights").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_slug_uq").on(t.slug),
    index("products_category_idx").on(t.categoryId),
    index("products_name_idx").on(t.name),
    check("products_qty_range", sql`${t.minQuantity} >= 1 AND (${t.maxQuantity} IS NULL OR ${t.maxQuantity} >= ${t.minQuantity})`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    /** Either a stored file or a static path under /public. */
    fileId: uuid("file_id"),
    url: text("url"),
    alt: text("alt").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

/**
 * Which process (Digital / Offset) can make a store product, and for which
 * quantity range. The pricing engine picks the cheapest eligible one; that
 * decides the order's production type.
 */
export const productMethods = pgTable(
  "product_methods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    methodCode: productionType("method_code").notNull(),
    minQuantity: integer("min_quantity").notNull().default(1),
    maxQuantity: integer("max_quantity"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("product_methods_uq").on(t.productId, t.methodCode)],
);

export const productOptionGroups = pgTable(
  "product_option_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 40 }).notNull(),
    label: text("label").notNull(),
    helpText: text("help_text"),
    type: optionType("type").notNull(),
    required: boolean("required").notNull().default(true),
    config: jsonb("config").$type<Partial<NumberConfig> | null>(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [uniqueIndex("product_option_groups_key_uq").on(t.productId, t.key)],
);

export const productOptionValues = pgTable(
  "product_option_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => productOptionGroups.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 40 }).notNull(),
    label: text("label").notNull(),
    description: text("description"),
    effects: jsonb("effects").$type<OptionEffects>().notNull().default({}),
    isDefault: boolean("is_default").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("product_option_values_key_uq").on(t.groupId, t.key)],
);
