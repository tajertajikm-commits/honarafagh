CREATE TYPE "public"."artwork_stage" AS ENUM('CUSTOMER_ORIGINAL', 'DESIGNER', 'PREPRESS', 'PROOF', 'PRINT_READY');--> statement-breakpoint
CREATE TYPE "public"."artwork_status" AS ENUM('UPLOADED', 'REJECTED', 'SENT_FOR_APPROVAL', 'CUSTOMER_APPROVED', 'CUSTOMER_REJECTED', 'APPROVED_FOR_PRINT', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."change_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('INDIVIDUAL', 'COMPANY');--> statement-breakpoint
CREATE TYPE "public"."defect_severity" AS ENUM('MINOR', 'MAJOR', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."delivery_kind" AS ENUM('PICKUP', 'INTERNAL', 'EXTERNAL');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('NOT_READY', 'READY', 'SCHEDULED', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."file_purpose" AS ENUM('ARTWORK', 'PROOF', 'QC_IMAGE', 'DELIVERY_PROOF', 'ATTACHMENT', 'PRODUCT_IMAGE', 'PAYMENT_RECEIPT');--> statement-breakpoint
CREATE TYPE "public"."file_status" AS ENUM('NOT_REQUIRED', 'AWAITING_FILE', 'IN_DESIGN', 'UNDER_REVIEW', 'NEEDS_REVISION', 'AWAITING_CUSTOMER_APPROVAL', 'APPROVED');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('NEW', 'IN_REVIEW', 'QUOTED', 'CLOSED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."inventory_tx_type" AS ENUM('RECEIVE', 'RESERVE', 'RELEASE', 'ISSUE', 'CONSUME', 'RETURN', 'ADJUST', 'WASTE');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('OPEN', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('MACHINE_BREAKDOWN', 'MATERIAL_SHORTAGE', 'FILE_PROBLEM', 'QUALITY_PROBLEM', 'WAITING_FOR_INFO', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('ACTIVE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('PLANNED', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."machine_status" AS ENUM('ACTIVE', 'MAINTENANCE', 'OUT_OF_SERVICE');--> statement-breakpoint
CREATE TYPE "public"."maintenance_kind" AS ENUM('PREVENTIVE', 'REPAIR', 'INSPECTION');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."material_request_reason" AS ENUM('SHORTAGE', 'REORDER', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."material_request_status" AS ENUM('OPEN', 'ORDERED', 'FULFILLED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."notification_audience" AS ENUM('CUSTOMER', 'ROLE');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('SMS', 'IN_APP', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."option_type" AS ENUM('SELECT', 'NUMBER', 'TOGGLE');--> statement-breakpoint
CREATE TYPE "public"."order_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('WEBSITE', 'SALES', 'QUOTE', 'PHONE', 'API');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'CONFIRMED', 'IN_PROGRESS', 'ON_HOLD', 'READY', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_kind" AS ENUM('PAYMENT', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('ONLINE', 'CASH', 'POS', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT');--> statement-breakpoint
CREATE TYPE "public"."payment_record_status" AS ENUM('PENDING', 'AWAITING_APPROVAL', 'CONFIRMED', 'FAILED', 'CANCELLED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERPAID', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."procurement_status" AS ENUM('NOT_EVALUATED', 'WAITING_FOR_MATERIAL', 'PARTIALLY_RESERVED', 'RESERVED', 'ISSUED', 'NOT_REQUIRED');--> statement-breakpoint
CREATE TYPE "public"."production_status" AS ENUM('NOT_STARTED', 'WAITING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."qc_result" AS ENUM('PASSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."qc_status" AS ENUM('PENDING', 'IN_REWORK', 'PASSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED', 'CONVERTED');--> statement-breakpoint
CREATE TYPE "public"."requirement_status" AS ENUM('PENDING', 'SHORTAGE', 'PARTIALLY_RESERVED', 'RESERVED', 'PARTIALLY_ISSUED', 'ISSUED', 'COMPLETED', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."rule_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('CUSTOMER', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('PENDING', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('PENDING', 'READY', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'COMPLETED', 'SKIPPED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."template_status" AS ENUM('DRAFT', 'ACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."urgency" AS ENUM('STANDARD', 'EXPRESS', 'RUSH');--> statement-breakpoint
CREATE TYPE "public"."user_kind" AS ENUM('CUSTOMER', 'EMPLOYEE');--> statement-breakpoint
CREATE SEQUENCE "public"."doc_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."order_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100001 CACHE 1;--> statement-breakpoint
CREATE TABLE "addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"title" text NOT NULL,
	"province" text NOT NULL,
	"city" text NOT NULL,
	"line" text NOT NULL,
	"postal_code" varchar(10),
	"recipient_name" text NOT NULL,
	"recipient_phone" varchar(11) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"phone" varchar(11) NOT NULL,
	"full_name" text NOT NULL,
	"type" "customer_type" DEFAULT 'INDIVIDUAL' NOT NULL,
	"company_name" text,
	"national_id" varchar(11),
	"economic_code" varchar(16),
	"email" text,
	"discount_pct" numeric(5, 2) DEFAULT 0 NOT NULL,
	"credit_limit" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_discount_range" CHECK ("customers"."discount_pct" >= 0 AND "customers"."discount_pct" <= 100)
);
--> statement-breakpoint
CREATE TABLE "employee_roles" (
	"employee_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "employee_roles_employee_id_role_id_pk" PRIMARY KEY("employee_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"personnel_code" varchar(16) NOT NULL,
	"title" text,
	"hourly_cost" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(11) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"ip" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(160) PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" varchar(64) NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(48) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"workspaces" text[] DEFAULT '{}'::text[] NOT NULL,
	"step_types" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "session_kind" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(11) NOT NULL,
	"full_name" text DEFAULT '' NOT NULL,
	"email" text,
	"password_hash" text,
	"kind" "user_kind" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_format" CHECK ("users"."phone" ~ '^09[0-9]{9}$')
);
--> statement-breakpoint
CREATE TABLE "machine_types" (
	"code" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"capacity_unit" varchar(24) DEFAULT 'SHEET' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(48) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_rule_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "rule_version_status" DEFAULT 'DRAFT' NOT NULL,
	"data" jsonb NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" uuid,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" varchar(32),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"file_id" uuid,
	"url" text,
	"alt" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"method_code" varchar(24) NOT NULL,
	"workflow_template_code" varchar(48) NOT NULL,
	"min_quantity" integer DEFAULT 1 NOT NULL,
	"max_quantity" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_option_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"label" text NOT NULL,
	"help_text" text,
	"type" "option_type" NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"config" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_option_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_methods" (
	"code" varchar(24) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" text NOT NULL,
	"subtitle" text,
	"description" text,
	"category_id" uuid,
	"pricing_rule_set_id" uuid NOT NULL,
	"spec" jsonb NOT NULL,
	"unit_label" text DEFAULT 'عدد' NOT NULL,
	"min_quantity" integer DEFAULT 1 NOT NULL,
	"max_quantity" integer,
	"quantity_step" integer DEFAULT 1 NOT NULL,
	"quantity_presets" integer[] DEFAULT '{}'::int[] NOT NULL,
	"requires_artwork" boolean DEFAULT true NOT NULL,
	"offers_design_service" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_qty_range" CHECK ("products"."min_quantity" >= 1 AND ("products"."max_quantity" IS NULL OR "products"."max_quantity" >= "products"."min_quantity"))
);
--> statement-breakpoint
CREATE TABLE "step_types" (
	"code" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" varchar(16) NOT NULL,
	"machine_type_code" varchar(32),
	"color" varchar(16),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_template_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"step_type_code" varchar(32) NOT NULL,
	"depends_on" text[] DEFAULT '{}'::text[] NOT NULL,
	"condition" jsonb DEFAULT '{"type":"ALWAYS"}'::jsonb NOT NULL,
	"gate" jsonb,
	"machine_type_code" varchar(32),
	"default_minutes" integer DEFAULT 0 NOT NULL,
	"min_lag_minutes" integer DEFAULT 0 NOT NULL,
	"is_qc" boolean DEFAULT false NOT NULL,
	"rework_targets" text[] DEFAULT '{}'::text[] NOT NULL,
	"milestone" varchar(16) NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(48) NOT NULL,
	"version" integer NOT NULL,
	"name" text NOT NULL,
	"method_code" varchar(24) NOT NULL,
	"status" "template_status" DEFAULT 'DRAFT' NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artwork_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"stage" "artwork_stage" NOT NULL,
	"status" "artwork_status" DEFAULT 'UPLOADED' NOT NULL,
	"file_id" uuid NOT NULL,
	"parent_version_id" uuid,
	"note" text,
	"uploaded_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"customer_decision_at" timestamp with time zone,
	"customer_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"selections" jsonb NOT NULL,
	"urgency" "urgency" DEFAULT 'STANDARD' NOT NULL,
	"quoted_subtotal" bigint NOT NULL,
	"pricing_version_id" uuid,
	"artwork_file_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"needs_design" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_qty_pos" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"token_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"label" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_driver" varchar(16) NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"purpose" "file_purpose" NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_size_pos" CHECK ("file_objects"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('doc_number_seq') NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer,
	"selections" jsonb,
	"deadline" timestamp with time zone,
	"status" "inquiry_status" DEFAULT 'NEW' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"description" text NOT NULL,
	"status" "change_request_status" DEFAULT 'PENDING' NOT NULL,
	"price_delta" bigint,
	"resolution" text,
	"requested_by" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid,
	"domain" varchar(16) NOT NULL,
	"type" varchar(48) NOT NULL,
	"from_state" varchar(32),
	"to_state" varchar(32),
	"message" text,
	"visible_to_customer" boolean DEFAULT false NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" uuid,
	"title" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_label" text DEFAULT 'عدد' NOT NULL,
	"selections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_snapshot" jsonb,
	"pricing_version_id" uuid,
	"line_subtotal" bigint NOT NULL,
	"cost_total" bigint DEFAULT 0 NOT NULL,
	"is_price_overridden" boolean DEFAULT false NOT NULL,
	"production_method" varchar(24),
	"workflow_template_code" varchar(48),
	"needs_design" boolean DEFAULT false NOT NULL,
	"status" "item_status" DEFAULT 'ACTIVE' NOT NULL,
	"file_status" "file_status" DEFAULT 'AWAITING_FILE' NOT NULL,
	"production_status" "production_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"qc_status" "qc_status" DEFAULT 'PENDING' NOT NULL,
	"quantity_produced" integer DEFAULT 0 NOT NULL,
	"quantity_delivered" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_qty_pos" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_delivered_le_qty" CHECK ("order_items"."quantity_delivered" <= "order_items"."quantity"),
	CONSTRAINT "order_items_subtotal_nonneg" CHECK ("order_items"."line_subtotal" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('order_number_seq') NOT NULL,
	"customer_id" uuid NOT NULL,
	"source" "order_source" NOT NULL,
	"quote_id" uuid,
	"status" "order_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"file_status" "file_status" DEFAULT 'AWAITING_FILE' NOT NULL,
	"procurement_status" "procurement_status" DEFAULT 'NOT_EVALUATED' NOT NULL,
	"production_status" "production_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"qc_status" "qc_status" DEFAULT 'PENDING' NOT NULL,
	"delivery_status" "delivery_status" DEFAULT 'NOT_READY' NOT NULL,
	"priority" "order_priority" DEFAULT 'NORMAL' NOT NULL,
	"urgency" "urgency" DEFAULT 'STANDARD' NOT NULL,
	"subtotal" bigint NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"shipping_amount" bigint DEFAULT 0 NOT NULL,
	"vat_amount" bigint DEFAULT 0 NOT NULL,
	"total" bigint NOT NULL,
	"paid_amount" bigint DEFAULT 0 NOT NULL,
	"refunded_amount" bigint DEFAULT 0 NOT NULL,
	"cost_total" bigint DEFAULT 0 NOT NULL,
	"deposit_pct" integer DEFAULT 50 NOT NULL,
	"payment_gate_override" boolean DEFAULT false NOT NULL,
	"delivery_method_id" uuid,
	"shipping_address" jsonb,
	"customer_note" text,
	"internal_note" text,
	"due_date" timestamp with time zone,
	"projected_completion_at" timestamp with time zone,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" uuid,
	"idempotency_key" varchar(80),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_amounts_nonneg" CHECK ("orders"."subtotal" >= 0 AND "orders"."discount_amount" >= 0 AND "orders"."vat_amount" >= 0 AND "orders"."total" >= 0 AND "orders"."paid_amount" >= 0 AND "orders"."refunded_amount" >= 0),
	CONSTRAINT "orders_deposit_range" CHECK ("orders"."deposit_pct" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"product_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"quantity" integer NOT NULL,
	"selections" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"price_snapshot" jsonb,
	"pricing_version_id" uuid,
	"line_subtotal" bigint NOT NULL,
	"cost_total" bigint DEFAULT 0 NOT NULL,
	"is_price_overridden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "quote_items_qty_pos" CHECK ("quote_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('doc_number_seq') NOT NULL,
	"inquiry_id" uuid,
	"customer_id" uuid NOT NULL,
	"status" "quote_status" DEFAULT 'DRAFT' NOT NULL,
	"urgency" "urgency" DEFAULT 'STANDARD' NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"subtotal" bigint DEFAULT 0 NOT NULL,
	"discount_amount" bigint DEFAULT 0 NOT NULL,
	"vat_amount" bigint DEFAULT 0 NOT NULL,
	"total" bigint DEFAULT 0 NOT NULL,
	"cost_total" bigint DEFAULT 0 NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"created_by" uuid,
	"sent_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"converted_order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotes_totals_nonneg" CHECK ("quotes"."subtotal" >= 0 AND "quotes"."discount_amount" >= 0 AND "quotes"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "goods_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('doc_number_seq') NOT NULL,
	"purchase_order_id" uuid,
	"received_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transactions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" "inventory_tx_type" NOT NULL,
	"material_id" uuid NOT NULL,
	"location_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"on_hand_delta" numeric(14, 3) DEFAULT 0 NOT NULL,
	"reserved_delta" numeric(14, 3) DEFAULT 0 NOT NULL,
	"unit_cost" numeric(16, 2),
	"order_id" uuid,
	"order_item_id" uuid,
	"task_id" uuid,
	"requirement_id" uuid,
	"purchase_order_id" uuid,
	"receipt_id" uuid,
	"reason" text,
	"performed_by" uuid,
	"idempotency_key" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inv_tx_qty_pos" CHECK ("inventory_transactions"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "machine_maintenance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"kind" "maintenance_kind" NOT NULL,
	"status" "maintenance_status" DEFAULT 'SCHEDULED' NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"scheduled_start" timestamp with time zone NOT NULL,
	"scheduled_end" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cost" bigint,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maintenance_window" CHECK ("machine_maintenance"."scheduled_end" > "machine_maintenance"."scheduled_start")
);
--> statement-breakpoint
CREATE TABLE "machines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" text NOT NULL,
	"type_code" varchar(32) NOT NULL,
	"method_code" varchar(24),
	"status" "machine_status" DEFAULT 'ACTIVE' NOT NULL,
	"capacity_per_hour" integer DEFAULT 1000 NOT NULL,
	"setup_minutes" integer DEFAULT 15 NOT NULL,
	"max_sheet_width_mm" integer,
	"max_sheet_height_mm" integer,
	"colors" integer,
	"hourly_cost" bigint DEFAULT 0 NOT NULL,
	"location" text,
	"default_operator_id" uuid,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_categories" (
	"code" varchar(24) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('doc_number_seq') NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"reason" "material_request_reason" NOT NULL,
	"status" "material_request_status" DEFAULT 'OPEN' NOT NULL,
	"requirement_id" uuid,
	"order_id" uuid,
	"needed_by" timestamp with time zone,
	"purchase_order_line_id" uuid,
	"requested_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_requests_qty_pos" CHECK ("material_requests"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "material_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"location_id" uuid,
	"purpose" varchar(16) NOT NULL,
	"component" varchar(32),
	"step_type_code" varchar(32) NOT NULL,
	"quantity_required" numeric(14, 3) NOT NULL,
	"quantity_reserved" numeric(14, 3) DEFAULT 0 NOT NULL,
	"quantity_issued" numeric(14, 3) DEFAULT 0 NOT NULL,
	"quantity_consumed" numeric(14, 3) DEFAULT 0 NOT NULL,
	"quantity_wasted" numeric(14, 3) DEFAULT 0 NOT NULL,
	"quantity_returned" numeric(14, 3) DEFAULT 0 NOT NULL,
	"status" "requirement_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "req_required_pos" CHECK ("material_requirements"."quantity_required" > 0),
	CONSTRAINT "req_reserved_nonneg" CHECK ("material_requirements"."quantity_reserved" >= 0),
	CONSTRAINT "req_issued_nonneg" CHECK ("material_requirements"."quantity_issued" >= 0),
	CONSTRAINT "req_usage_le_issued" CHECK ("material_requirements"."quantity_consumed" + "material_requirements"."quantity_wasted" + "material_requirements"."quantity_returned" <= "material_requirements"."quantity_issued")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" varchar(48) NOT NULL,
	"name" text NOT NULL,
	"category_code" varchar(24) NOT NULL,
	"unit" varchar(12) NOT NULL,
	"reorder_point" numeric(14, 3) DEFAULT 0 NOT NULL,
	"reorder_quantity" numeric(14, 3) DEFAULT 0 NOT NULL,
	"standard_cost" numeric(16, 2) DEFAULT 0 NOT NULL,
	"default_supplier_id" uuid,
	"default_location_id" uuid,
	"paper_type" text,
	"brand" text,
	"grammage" integer,
	"sheet_width_mm" integer,
	"sheet_height_mm" integer,
	"color" text,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_cost_nonneg" CHECK ("materials"."standard_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"location_id" uuid,
	"quantity" numeric(14, 3) NOT NULL,
	"received_quantity" numeric(14, 3) DEFAULT 0 NOT NULL,
	"unit_cost" numeric(16, 2) DEFAULT 0 NOT NULL,
	"note" text,
	CONSTRAINT "po_lines_qty_pos" CHECK ("purchase_order_lines"."quantity" > 0),
	CONSTRAINT "po_lines_received_nonneg" CHECK ("purchase_order_lines"."received_quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('doc_number_seq') NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'DRAFT' NOT NULL,
	"ordered_at" timestamp with time zone,
	"expected_at" timestamp with time zone,
	"total_amount" bigint DEFAULT 0 NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"material_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"on_hand" numeric(14, 3) DEFAULT 0 NOT NULL,
	"reserved" numeric(14, 3) DEFAULT 0 NOT NULL,
	"available" numeric(14, 3) GENERATED ALWAYS AS (on_hand - reserved) STORED,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_material_id_location_id_pk" PRIMARY KEY("material_id","location_id"),
	CONSTRAINT "stock_on_hand_nonneg" CHECK ("stock_levels"."on_hand" >= 0),
	CONSTRAINT "stock_reserved_nonneg" CHECK ("stock_levels"."reserved" >= 0),
	CONSTRAINT "stock_reserved_le_on_hand" CHECK ("stock_levels"."reserved" <= "stock_levels"."on_hand")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" varchar(16),
	"email" text,
	"address" text,
	"lead_time_days" integer DEFAULT 3 NOT NULL,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(24) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "issue_type" NOT NULL,
	"status" "issue_status" DEFAULT 'OPEN' NOT NULL,
	"description" text NOT NULL,
	"resolution" text,
	"reported_by" uuid,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('doc_number_seq') NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"method_code" varchar(24) NOT NULL,
	"status" "job_status" DEFAULT 'PLANNED' NOT NULL,
	"quantity" integer NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"due_date" timestamp with time zone,
	"released_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"step_key" varchar(40) NOT NULL,
	"step_type_code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"depends_on" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "task_status" DEFAULT 'PENDING' NOT NULL,
	"gate" jsonb,
	"is_qc" boolean DEFAULT false NOT NULL,
	"rework_targets" text[] DEFAULT '{}'::text[] NOT NULL,
	"milestone" varchar(16) NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"machine_type_code" varchar(32),
	"machine_id" uuid,
	"assignee_id" uuid,
	"priority" integer DEFAULT 50 NOT NULL,
	"estimated_minutes" integer DEFAULT 0 NOT NULL,
	"actual_minutes" integer DEFAULT 0 NOT NULL,
	"min_lag_minutes" integer DEFAULT 0 NOT NULL,
	"quantity_planned" integer NOT NULL,
	"quantity_completed" integer DEFAULT 0 NOT NULL,
	"ready_at" timestamp with time zone,
	"earliest_start_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"blocked_reason" text,
	"rework_of_task_id" uuid,
	"rework_reason" text,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_tasks_qty_nonneg" CHECK ("production_tasks"."quantity_planned" >= 0 AND "production_tasks"."quantity_completed" >= 0),
	CONSTRAINT "production_tasks_started_when_running" CHECK ("production_tasks"."status" NOT IN ('IN_PROGRESS','PAUSED') OR "production_tasks"."started_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "qc_defect_types" (
	"code" varchar(32) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qc_defects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid NOT NULL,
	"defect_code" varchar(32) NOT NULL,
	"severity" "defect_severity" NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "qc_inspections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"inspector_id" uuid,
	"result" "qc_result" NOT NULL,
	"quantity_checked" integer NOT NULL,
	"quantity_rejected" integer DEFAULT 0 NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rework_target_step_key" varchar(40),
	"rework_quantity" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qc_rejected_le_checked" CHECK ("qc_inspections"."quantity_rejected" >= 0 AND "qc_inspections"."quantity_rejected" <= "qc_inspections"."quantity_checked")
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"type" varchar(32) NOT NULL,
	"actor_id" uuid,
	"note" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_time_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"employee_id" uuid,
	"machine_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" varchar(16)
);
--> statement-breakpoint
CREATE TABLE "delivery_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "delivery_kind" NOT NULL,
	"provider_code" varchar(32),
	"base_fee" bigint DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('doc_number_seq') NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"kind" "payment_kind" DEFAULT 'PAYMENT' NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_record_status" NOT NULL,
	"amount" bigint NOT NULL,
	"provider" varchar(24),
	"provider_authority" varchar(128),
	"provider_ref_id" varchar(128),
	"card_pan_masked" varchar(32),
	"gateway_payload" jsonb,
	"reference" text,
	"cheque_due_date" timestamp with time zone,
	"note" text,
	"receipt_file_id" uuid,
	"idempotency_key" varchar(80),
	"created_by" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"rejection_reason" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_pos" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "shipment_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "shipment_items_qty_pos" CHECK ("shipment_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer DEFAULT nextval('doc_number_seq') NOT NULL,
	"order_id" uuid NOT NULL,
	"method_id" uuid NOT NULL,
	"status" "shipment_status" DEFAULT 'PENDING' NOT NULL,
	"assignee_id" uuid,
	"vehicle_id" uuid,
	"external_provider" text,
	"tracking_code" text,
	"scheduled_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"recipient_name" text,
	"recipient_phone" varchar(11),
	"address" jsonb,
	"notes" text,
	"proof_note" text,
	"proof_file_id" uuid,
	"failure_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"plate_number" varchar(32),
	"kind" varchar(24) DEFAULT 'VAN' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text NOT NULL,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(24) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" uuid NOT NULL,
	"external_id" text,
	"status" varchar(16) NOT NULL,
	"last_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"role_code" varchar(48),
	"title" text NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"phone" varchar(11),
	"channel" "notification_channel" NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"dedupe_key" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" varchar(64) NOT NULL,
	"aggregate_type" varchar(32) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_versions" ADD CONSTRAINT "pricing_rule_versions_rule_set_id_pricing_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."pricing_rule_sets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_versions" ADD CONSTRAINT "pricing_rule_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_rule_versions" ADD CONSTRAINT "pricing_rule_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_methods" ADD CONSTRAINT "product_methods_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_methods" ADD CONSTRAINT "product_methods_method_code_production_methods_code_fk" FOREIGN KEY ("method_code") REFERENCES "public"."production_methods"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_groups" ADD CONSTRAINT "product_option_groups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_group_id_product_option_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_option_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_pricing_rule_set_id_pricing_rule_sets_id_fk" FOREIGN KEY ("pricing_rule_set_id") REFERENCES "public"."pricing_rule_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_types" ADD CONSTRAINT "step_types_machine_type_code_machine_types_code_fk" FOREIGN KEY ("machine_type_code") REFERENCES "public"."machine_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_steps" ADD CONSTRAINT "workflow_template_steps_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_steps" ADD CONSTRAINT "workflow_template_steps_step_type_code_step_types_code_fk" FOREIGN KEY ("step_type_code") REFERENCES "public"."step_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_template_steps" ADD CONSTRAINT "workflow_template_steps_machine_type_code_machine_types_code_fk" FOREIGN KEY ("machine_type_code") REFERENCES "public"."machine_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_method_code_production_methods_code_fk" FOREIGN KEY ("method_code") REFERENCES "public"."production_methods"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_templates" ADD CONSTRAINT "workflow_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_versions" ADD CONSTRAINT "artwork_versions_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_versions" ADD CONSTRAINT "artwork_versions_file_id_file_objects_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_versions" ADD CONSTRAINT "artwork_versions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artwork_versions" ADD CONSTRAINT "artwork_versions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_pricing_version_id_pricing_rule_versions_id_fk" FOREIGN KEY ("pricing_version_id") REFERENCES "public"."pricing_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_files" ADD CONSTRAINT "entity_files_file_id_file_objects_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_files" ADD CONSTRAINT "entity_files_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_requests" ADD CONSTRAINT "order_change_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_requests" ADD CONSTRAINT "order_change_requests_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_requests" ADD CONSTRAINT "order_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_change_requests" ADD CONSTRAINT "order_change_requests_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_pricing_version_id_pricing_rule_versions_id_fk" FOREIGN KEY ("pricing_version_id") REFERENCES "public"."pricing_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_method_id_delivery_methods_id_fk" FOREIGN KEY ("delivery_method_id") REFERENCES "public"."delivery_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_pricing_version_id_pricing_rule_versions_id_fk" FOREIGN KEY ("pricing_version_id") REFERENCES "public"."pricing_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_requirement_id_material_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."material_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_maintenance" ADD CONSTRAINT "machine_maintenance_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_maintenance" ADD CONSTRAINT "machine_maintenance_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_type_code_machine_types_code_fk" FOREIGN KEY ("type_code") REFERENCES "public"."machine_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_method_code_production_methods_code_fk" FOREIGN KEY ("method_code") REFERENCES "public"."production_methods"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machines" ADD CONSTRAINT "machines_default_operator_id_employees_id_fk" FOREIGN KEY ("default_operator_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_requirement_id_material_requirements_id_fk" FOREIGN KEY ("requirement_id") REFERENCES "public"."material_requirements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_requirements" ADD CONSTRAINT "material_requirements_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_category_code_material_categories_code_fk" FOREIGN KEY ("category_code") REFERENCES "public"."material_categories"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_default_supplier_id_suppliers_id_fk" FOREIGN KEY ("default_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_default_location_id_warehouse_locations_id_fk" FOREIGN KEY ("default_location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_warehouse_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."warehouse_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_issues" ADD CONSTRAINT "production_issues_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_issues" ADD CONSTRAINT "production_issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_issues" ADD CONSTRAINT "production_issues_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_issues" ADD CONSTRAINT "production_issues_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_template_id_workflow_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."workflow_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_step_type_code_step_types_code_fk" FOREIGN KEY ("step_type_code") REFERENCES "public"."step_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_machine_type_code_machine_types_code_fk" FOREIGN KEY ("machine_type_code") REFERENCES "public"."machine_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_assignee_id_employees_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_defects" ADD CONSTRAINT "qc_defects_inspection_id_qc_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."qc_inspections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_defects" ADD CONSTRAINT "qc_defects_defect_code_qc_defect_types_code_fk" FOREIGN KEY ("defect_code") REFERENCES "public"."qc_defect_types"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_job_id_production_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."production_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qc_inspections" ADD CONSTRAINT "qc_inspections_inspector_id_employees_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_time_logs" ADD CONSTRAINT "task_time_logs_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_receipt_file_id_file_objects_id_fk" FOREIGN KEY ("receipt_file_id") REFERENCES "public"."file_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_method_id_delivery_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."delivery_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_assignee_id_employees_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_proof_file_id_file_objects_id_fk" FOREIGN KEY ("proof_file_id") REFERENCES "public"."file_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_customer_idx" ON "addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_uq" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_uq" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_name_trgm" ON "customers" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "employees_user_uq" ON "employees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_code_uq" ON "employees" USING btree ("personnel_code");--> statement-breakpoint
CREATE INDEX "otp_phone_idx" ON "otp_challenges" USING btree ("phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_uq" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_kind_uq" ON "users" USING btree ("phone","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rule_sets_code_uq" ON "pricing_rule_sets" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rule_versions_uq" ON "pricing_rule_versions" USING btree ("rule_set_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "pricing_rule_versions_one_published" ON "pricing_rule_versions" USING btree ("rule_set_id") WHERE "pricing_rule_versions"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "product_categories_slug_uq" ON "product_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_images_product_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_methods_uq" ON "product_methods" USING btree ("product_id","method_code");--> statement-breakpoint
CREATE UNIQUE INDEX "product_option_groups_key_uq" ON "product_option_groups" USING btree ("product_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "product_option_values_key_uq" ON "product_option_values" USING btree ("group_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_uq" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_name_trgm" ON "products" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_template_steps_key_uq" ON "workflow_template_steps" USING btree ("template_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_templates_code_version_uq" ON "workflow_templates" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_templates_one_active" ON "workflow_templates" USING btree ("code") WHERE "workflow_templates"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "artwork_versions_no_uq" ON "artwork_versions" USING btree ("order_item_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "artwork_versions_one_approved" ON "artwork_versions" USING btree ("order_item_id") WHERE "artwork_versions"."status" = 'APPROVED_FOR_PRINT';--> statement-breakpoint
CREATE INDEX "cart_items_cart_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_customer_uq" ON "carts" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_token_uq" ON "carts" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "entity_files_entity_idx" ON "entity_files" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_objects_key_uq" ON "file_objects" USING btree ("storage_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inquiries_number_uq" ON "inquiries" USING btree ("number");--> statement-breakpoint
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "order_change_requests_order_idx" ON "order_change_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_line_uq" ON "order_items" USING btree ("order_id","line_no");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_uq" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_uq" ON "orders" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id","placed_at");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_due_idx" ON "orders" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "quote_items_quote_idx" ON "quote_items" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_uq" ON "quotes" USING btree ("number");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "inv_tx_material_idx" ON "inventory_transactions" USING btree ("material_id","created_at");--> statement-breakpoint
CREATE INDEX "inv_tx_order_idx" ON "inventory_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "inv_tx_task_idx" ON "inventory_transactions" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inv_tx_idempotency_uq" ON "inventory_transactions" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "maintenance_machine_idx" ON "machine_maintenance" USING btree ("machine_id","scheduled_start");--> statement-breakpoint
CREATE UNIQUE INDEX "machines_code_uq" ON "machines" USING btree ("code");--> statement-breakpoint
CREATE INDEX "machines_type_idx" ON "machines" USING btree ("type_code");--> statement-breakpoint
CREATE UNIQUE INDEX "material_requests_number_uq" ON "material_requests" USING btree ("number");--> statement-breakpoint
CREATE INDEX "material_requests_status_idx" ON "material_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "material_requests_open_requirement_uq" ON "material_requests" USING btree ("requirement_id") WHERE "material_requests"."status" IN ('OPEN','ORDERED') AND "material_requests"."requirement_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "material_requirements_item_idx" ON "material_requirements" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "material_requirements_material_idx" ON "material_requirements" USING btree ("material_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_sku_uq" ON "materials" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "materials_category_idx" ON "materials" USING btree ("category_code");--> statement-breakpoint
CREATE INDEX "materials_name_trgm" ON "materials" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "po_lines_po_idx" ON "purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "po_lines_material_idx" ON "purchase_order_lines" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_number_uq" ON "purchase_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "suppliers_name_trgm" ON "suppliers" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_locations_code_uq" ON "warehouse_locations" USING btree ("code");--> statement-breakpoint
CREATE INDEX "production_issues_status_idx" ON "production_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "production_issues_task_idx" ON "production_issues" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_jobs_number_uq" ON "production_jobs" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "production_jobs_item_uq" ON "production_jobs" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "production_jobs_status_idx" ON "production_jobs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "production_tasks_attempt_uq" ON "production_tasks" USING btree ("job_id","step_key","attempt");--> statement-breakpoint
CREATE INDEX "production_tasks_status_idx" ON "production_tasks" USING btree ("status","step_type_code");--> statement-breakpoint
CREATE INDEX "production_tasks_machine_idx" ON "production_tasks" USING btree ("machine_id","status");--> statement-breakpoint
CREATE INDEX "production_tasks_assignee_idx" ON "production_tasks" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "production_tasks_order_idx" ON "production_tasks" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "qc_defects_inspection_idx" ON "qc_defects" USING btree ("inspection_id");--> statement-breakpoint
CREATE INDEX "qc_inspections_item_idx" ON "qc_inspections" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_time_logs_task_idx" ON "task_time_logs" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_time_logs_one_open" ON "task_time_logs" USING btree ("task_id") WHERE "task_time_logs"."ended_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_methods_code_uq" ON "delivery_methods" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_number_uq" ON "payments" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_uq" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_authority_uq" ON "payments" USING btree ("provider","provider_authority") WHERE "payments"."provider_authority" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_ref_uq" ON "payments" USING btree ("provider","provider_ref_id") WHERE "payments"."provider_ref_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_items_uq" ON "shipment_items" USING btree ("shipment_id","order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shipments_number_uq" ON "shipments" USING btree ("number");--> statement-breakpoint
CREATE INDEX "shipments_order_idx" ON "shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_links_uq" ON "integration_links" USING btree ("provider","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "notification_templates_event_idx" ON "notification_templates" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_pending_idx" ON "outbox_events" USING btree ("status","available_at");