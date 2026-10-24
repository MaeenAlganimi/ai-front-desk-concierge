import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import pg from "pg";
import { Pool as NeonPool, neonConfig, types as neonTypes } from "@neondatabase/serverless";
import ws from "ws";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { seed } from "./seed";

export type QueryResult<T> = { rows: T[] };
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
export interface Database extends Queryable {
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  readonly kind: "pglite" | "postgres";
}

async function schemaSql() {
  return readFile(join(process.cwd(), "src/lib/db/schema.sql"), "utf8");
}

async function init(db: Database) {
  try {
    await db.exec(await schemaSql());
    await seed(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export async function createPgliteDatabase(path = "memory://"): Promise<Database> {
  if (!path.startsWith("memory://")) mkdirSync(dirname(path), { recursive: true });
  const pg = new PGlite(path, { extensions: { vector } });
  const db: Database = {
    kind: "pglite",
    query: (sql, params) => pg.query(sql, params) as never,
    exec: (sql) => pg.exec(sql),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (s, p) => tx.query(s, p) as never })),
    close: () => pg.close(),
  };
  return init(db);
}

/** "neon" = Neon serverless driver over WebSockets (port 443); "pg" = node-postgres TCP (5432). */
export function pickDriver(url: string, env = process.env.DATABASE_DRIVER) {
  if (env === "neon" || env === "pg") return env;
  return /\.neon\.tech([:/?]|$)/.test(url) ? "neon" : "pg";
}

export async function createPostgresDatabase(url: string): Promise<Database> {
  const max = Number(process.env.DATABASE_POOL_MAX || 5);
  let pool: pg.Pool;
  if (pickDriver(url) === "neon") {
    neonConfig.webSocketConstructor ??= ws;
    neonTypes.setTypeParser(20, (v: string) => Number(v));
    neonTypes.setTypeParser(1700, (v: string) => Number(v));
    pool = new NeonPool({ connectionString: url, max }) as unknown as pg.Pool;
  } else {
    // return int8/numeric as JS numbers like PGlite does
    pg.types.setTypeParser(20, (v: string) => Number(v));
    pg.types.setTypeParser(1700, (v: string) => Number(v));
    const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
    pool = new pg.Pool({
      connectionString: url,
      max,
      ssl: local || /sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: true },
    });
  }
  const db: Database = {
    kind: "postgres",
    query: async (sql, params) => ({ rows: (await pool.query(sql, params as unknown[])).rows }),
    exec: (sql) => pool.query(sql),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          query: async (s, p) => ({ rows: (await client.query(s, p as unknown[])).rows }),
        });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  return init(db);
}

/** Hosted Postgres when DATABASE_URL is set, otherwise PGlite (in-memory or file path). */
export async function createDatabase(path?: string): Promise<Database> {
  if (path === undefined && process.env.DATABASE_URL)
    return createPostgresDatabase(process.env.DATABASE_URL);
  return createPgliteDatabase(path ?? "memory://");
}

const globalDb = globalThis as typeof globalThis & {
  conciergeDb?: Promise<Database>;
};
export function getDb() {
  if (!globalDb.conciergeDb) {
    globalDb.conciergeDb = (
      process.env.DATABASE_URL
        ? createPostgresDatabase(process.env.DATABASE_URL)
        : createPgliteDatabase(process.env.CONCIERGE_DB_PATH || "./.data/pglite")
    ).catch((error) => {
      globalDb.conciergeDb = undefined;
      throw error;
    });
  }
  return globalDb.conciergeDb;
}
