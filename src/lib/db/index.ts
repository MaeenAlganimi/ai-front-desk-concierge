import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { seed } from "./seed";
export type Database = PGlite;
export async function createDatabase(path = "memory://"): Promise<Database> {
  if (!path.startsWith("memory://")) mkdirSync(dirname(path), { recursive: true });
  const db = new PGlite(path, { extensions: { vector } });
  try {
    await db.exec(
      await readFile(join(process.cwd(), "src/lib/db/schema.sql"), "utf8"),
    );
    await seed(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
const globalDb = globalThis as typeof globalThis & {
  conciergeDb?: Promise<Database>;
};
export function getDb() {
  if (!globalDb.conciergeDb) {
    globalDb.conciergeDb = createDatabase(
      process.env.CONCIERGE_DB_PATH || "./.data/pglite",
    ).catch((error) => {
      globalDb.conciergeDb = undefined;
      throw error;
    });
  }
  return globalDb.conciergeDb;
}
