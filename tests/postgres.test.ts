import { describe, expect, it } from "vitest";
import { createPostgresDatabase, createDatabase } from "../src/lib/db";

const url = process.env.TEST_DATABASE_URL;
describe("database selection", () => {
  it("falls back to PGlite when DATABASE_URL is unset", async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const db = await createDatabase();
    expect(db.kind).toBe("pglite");
    await db.close();
    if (prev) process.env.DATABASE_URL = prev;
  });
});
describe.skipIf(!url)("hosted Postgres (TEST_DATABASE_URL)", () => {
  it("creates schema with pgvector, seeds, and runs vector + transaction queries", { timeout: 120000 }, async () => {
    const db = await createPostgresDatabase(url!);
    try {
      expect(db.kind).toBe("postgres");
      const n = await db.query<{ n: number }>("SELECT count(*) AS n FROM concierge_services");
      expect(n.rows[0].n).toBeGreaterThan(0);
      const v = await db.query<{ id: string }>("SELECT id FROM concierge_kb_chunks ORDER BY embedding <=> (SELECT embedding FROM concierge_kb_chunks LIMIT 1) LIMIT 1");
      expect(v.rows.length).toBe(1);
      await expect(db.transaction(async (tx) => {
        await tx.query("INSERT INTO concierge_customers VALUES ('tx-test','T','tx-000','')");
        throw new Error("rollback");
      })).rejects.toThrow("rollback");
      expect((await db.query("SELECT 1 FROM concierge_customers WHERE id='tx-test'")).rows.length).toBe(0);
    } finally {
      await db.close();
    }
  });
});
import { pickDriver } from "../src/lib/db";
describe("driver selection", () => {
  it("uses the Neon WebSocket driver for neon.tech hosts and pg otherwise", () => {
    expect(pickDriver("postgresql://u:p@ep-x.eu-central-1.aws.neon.tech/db?sslmode=require", undefined)).toBe("neon");
    expect(pickDriver("postgresql://u:p@db.example.com:5432/db", undefined)).toBe("pg");
    expect(pickDriver("postgresql://u:p@ep-x.neon.tech/db", "pg")).toBe("pg");
  });
});
