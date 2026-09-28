ALTER TABLE "orders" ADD COLUMN "vat_pct" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "vat_pct" integer DEFAULT 10 NOT NULL;