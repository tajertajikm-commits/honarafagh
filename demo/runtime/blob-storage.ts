import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type { StorageDriver } from "@/server/integrations/storage";

/**
 * Static-demo storage: file bytes live in a table inside the (browser) PGlite
 * database, so uploads persist with the rest of the demo data and are part of
 * the seed snapshot. Never used by the production build.
 */
export class DatabaseStorage implements StorageDriver {
  readonly name = "database" as const;

  async put(key: string, data: Buffer, contentType: string) {
    await getDb().execute(sql`INSERT INTO demo_blobs (key, data, content_type) VALUES (${key}, ${new Uint8Array(data)}, ${contentType}) ON CONFLICT (key) DO NOTHING`);
  }

  async get(key: string): Promise<Buffer> {
    const r = await getDb().execute<{ data: Uint8Array }>(sql`SELECT data FROM demo_blobs WHERE key = ${key}`);
    const row = r.rows[0];
    if (!row) throw new Error(`file not found: ${key}`);
    return Buffer.from(row.data);
  }

  async stream(key: string): Promise<ReadableStream<Uint8Array>> {
    const data = await this.get(key);
    return new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array(data));
        c.close();
      },
    });
  }

  async delete(key: string) {
    await getDb().execute(sql`DELETE FROM demo_blobs WHERE key = ${key}`);
  }
}

/** Extra tables only the static demo needs. */
export const DEMO_SQL = `
CREATE TABLE IF NOT EXISTS demo_blobs (key text PRIMARY KEY, data bytea NOT NULL, content_type text NOT NULL);
CREATE TABLE IF NOT EXISTS demo_meta (key text PRIMARY KEY, value text NOT NULL);
`;
