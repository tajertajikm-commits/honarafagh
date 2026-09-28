/** Static demo stand-in for `@/server/integrations/storage` (files live in the demo database). */
import { DatabaseStorage } from "./blob-storage";

export interface StorageDriver {
  readonly name: "local" | "s3" | "database";
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  delete(key: string): Promise<void>;
}

let driver: StorageDriver = new DatabaseStorage();

export function setStorageDriver(d: StorageDriver) {
  driver = d;
}

export function storage(): StorageDriver {
  return driver;
}
