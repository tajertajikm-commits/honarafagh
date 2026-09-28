-- Append-only ledgers: inventory movements and audit records can never be
-- edited or deleted. Corrections are new rows (e.g. an ADJUST transaction).
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (% not allowed)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER inventory_transactions_append_only
  BEFORE UPDATE OR DELETE ON inventory_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
--> statement-breakpoint
-- Search helpers
CREATE INDEX IF NOT EXISTS users_name_trgm ON users USING gin (full_name gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS customers_company_trgm ON customers USING gin (company_name gin_trgm_ops);
