import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/lib/db";
import { executeTool, businessTimeZone } from "../src/lib/agent/tools";
import { toZonedIso, zonedParts, zonedToUtc } from "../src/lib/time";
import { randomUUID } from "node:crypto";

describe("time helpers", () => {
  it("converts wall clock to UTC across zones and DST", () => {
    expect(zonedToUtc("2026-10-25", "09:00", "Asia/Dubai").toISOString()).toBe("2026-10-25T05:00:00.000Z");
    expect(zonedToUtc("2026-07-01", "09:00", "Europe/London").toISOString()).toBe("2026-07-01T08:00:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:00", "Europe/London").toISOString()).toBe("2026-12-01T09:00:00.000Z");
    expect(zonedToUtc("2026-03-08", "10:00", "America/New_York").toISOString()).toBe("2026-03-08T14:00:00.000Z");
    expect(toZonedIso(new Date("2026-10-25T05:00:00Z"), "Asia/Dubai")).toBe("2026-10-25T09:00:00+04:00");
    expect(zonedParts(new Date("2026-10-24T23:30:00Z"), "Asia/Dubai").date).toBe("2026-10-25");
  });
});

describe("per-business timezone", () => {
  let db: Database;
  let date: string;
  const cid = randomUUID();
  beforeAll(async () => {
    process.env.BUSINESS_TIMEZONE = "Asia/Dubai";
    db = await createDatabase("memory://");
    delete process.env.BUSINESS_TIMEZONE;
    let d = new Date(Date.now() + 3 * 86400000);
    while (zonedParts(d, "Asia/Dubai").weekday === 5) d = new Date(+d + 86400000);
    date = zonedParts(d, "Asia/Dubai").date;
    await db.query("INSERT INTO concierge_conversations (id,customer_id) VALUES ($1,'amina')", [cid]);
  });
  afterAll(() => db?.close());
  const ctx = () => ({ db, conversationId: cid, customerId: "amina" });

  it("stores the business timezone", async () => {
    expect(await businessTimeZone(db)).toBe("Asia/Dubai");
  });
  it("seeds appointments at local wall-clock times", async () => {
    const r = await db.query<{ starts_at: Date }>("SELECT starts_at FROM concierge_appointments WHERE staff_id='sara' AND starts_at >= $1 ORDER BY starts_at LIMIT 1", [zonedToUtc(date, "00:00", "Asia/Dubai").toISOString()]);
    expect(zonedParts(new Date(r.rows[0].starts_at), "Asia/Dubai").time).toBe("17:00");
  });
  it("offers slots inside local opening hours with local offsets", async () => {
    const r = await executeTool("check_availability", { service: "consultation", date_from: date, date_to: date, staff: "omar" }, ctx());
    expect(r.timezone).toBe("Asia/Dubai");
    const slots = r.slots as { starts_at: string; starts_at_local: string }[];
    expect(slots[0].starts_at_local).toBe(`${date}T09:00:00+04:00`);
    expect(slots[0].starts_at).toBe(zonedToUtc(date, "09:00", "Asia/Dubai").toISOString());
    // seeded 10:00 local consultation blocks 09:45 & 10:00 for omar
    expect(slots.some((s) => s.starts_at_local.includes("T10:00"))).toBe(false);
  });
  it("rejects a booking before local opening (08:00 local = 04:00Z)", async () => {
    const r = await executeTool("book_appointment", { service: "consultation", staff: "omar", starts_at: `${date}T08:00:00+04:00` }, ctx());
    expect(r.error).toBeTruthy();
    const ok = await executeTool("book_appointment", { service: "consultation", staff: "omar", starts_at: `${date}T11:00:00+04:00` }, ctx());
    expect(ok.status).toBe("booked");
    expect(ok.starts_at_local).toBe(`${date}T11:00:00+04:00`);
  });
});
