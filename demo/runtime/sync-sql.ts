/**
 * Row-level change capture for the shared (PHP-synced) static demo. Installed
 * into the seed snapshot after seeding, so the seed itself is not a change.
 *
 * - Every write to a synced table appends the old/new row to demo_changes.
 * - demo_apply() replays one captured change on another browser's database
 *   (called with session_replication_role = replica, so triggers, foreign-key
 *   actions and append-only guards stay out of the way). A change that cannot
 *   be applied is skipped with a warning instead of blocking the whole log.
 */
// Sessions and OTP challenges are shared too: a tab rebuilds its database from the log on every page load.
export const LOCAL_ONLY_TABLES = ["demo_changes", "demo_meta", "rate_limits", "outbox_events"];

export const SYNC_SQL = `
CREATE TABLE IF NOT EXISTS demo_changes (id bigserial PRIMARY KEY, tbl text NOT NULL, op text NOT NULL, old jsonb, new jsonb);

CREATE OR REPLACE FUNCTION demo_capture() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  INSERT INTO demo_changes (tbl, op, old, new)
  VALUES (TG_TABLE_NAME, TG_OP,
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  RETURN NULL;
END $fn$;

CREATE OR REPLACE FUNCTION demo_apply(t text, op text, o jsonb, n jsonb) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
  pk text[];
  cond text;
BEGIN
  SELECT array_agg(a.attname::text ORDER BY a.attnum) INTO pk
  FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
  WHERE i.indrelid = format('public.%I', t)::regclass AND i.indisprimary;
  IF op IN ('UPDATE', 'DELETE') THEN
    SELECT string_agg(format('%I = (jsonb_populate_record(null::public.%I, $1)).%I', c, t, c), ' AND ') INTO cond FROM unnest(pk) c;
    EXECUTE format('DELETE FROM public.%I WHERE %s', t, cond) USING o;
  END IF;
  IF op IN ('INSERT', 'UPDATE') THEN
    EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(null::public.%I, $1) ON CONFLICT DO NOTHING', t, t) USING n;
  END IF;
EXCEPTION WHEN others THEN
  RAISE WARNING 'demo sync: skipped % on %: %', op, t, SQLERRM;
END $fn$;

DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL (ARRAY[${LOCAL_ONLY_TABLES.map((t) => `'${t}'`).join(", ")}]) LOOP
    EXECUTE format('CREATE TRIGGER demo_capture AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION demo_capture()', r.tablename);
  END LOOP;
END $do$;
`;
