ALTER TABLE "production_steps" ADD COLUMN "assigned_by" uuid;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "delivered_by_id" uuid;--> statement-breakpoint
ALTER TABLE "production_steps" ADD CONSTRAINT "production_steps_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_delivered_by_id_employees_id_fk" FOREIGN KEY ("delivered_by_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;