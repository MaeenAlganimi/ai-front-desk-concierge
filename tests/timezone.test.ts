import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/lib/db";
import { executeTool, businessTimeZone } from "../src/lib/agent/tools";
import { formatLocal, toZonedIso, zonedParts, zonedToUtc } from "../src/lib/time";
import { isAlternativeTime, runAgent } from "../src/lib/agent/loop";
import type { LLM } from "../src/lib/agent/llm";
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

describe("local-time display and alternative detection", () => {
  let db: Database;
  let date: string;
  const tz = "Asia/Dubai";
  beforeAll(async () => {
    process.env.BUSINESS_TIMEZONE = tz;
    db = await createDatabase("memory://");
    delete process.env.BUSINESS_TIMEZONE;
    let d = new Date(Date.now() + 3 * 86400000);
    while (zonedParts(d, tz).weekday === 5) d = new Date(+d + 86400000);
    date = zonedParts(d, tz).date;
  });
  afterAll(() => db?.close());

  // Scripted planner: search after 17:00 local, then propose the first slot returned.
  const scripted = (staff: string): LLM => ({
    mode: "mock",
    async plan(c) {
      const found = c.results.find((r) => r.call.name === "check_availability");
      if (!found)
        return { calls: [{ name: "check_availability", args: { service: "cleaning", date_from: date, date_to: date, after_time: "17:00", staff } }] };
      const slot = (found.result.slots as { starts_at: string; staff: string }[])[0];
      return { calls: [{ name: "book_appointment", args: { service: "cleaning", staff: slot.staff, starts_at: slot.starts_at } }] };
    },
  });

  it("formats instants in the business timezone", () => {
    expect(formatLocal("2026-10-27T13:45:00.000Z", tz)).toBe("2026-10-27 17:45 (Asia/Dubai)");
    expect(formatLocal("2026-10-27T13:45:00.000Z", "UTC")).toBe("2026-10-27 13:45 (UTC)");
  });

  it("compares the requested local time with the proposal's local time, not its UTC time", () => {
    // 17:00 in Dubai is 13:00Z: the old check compared "13:00" (UTC) with "17:00" (local) and wrongly said "unavailable".
    expect(isAlternativeTime("17:00", "2026-10-27T13:00:00.000Z", tz)).toBe(false);
    expect(isAlternativeTime("17:00", "2026-10-27T13:45:00.000Z", tz)).toBe(true);
    expect(isAlternativeTime("17:00", "2026-10-27T17:00:00.000Z", "UTC")).toBe(false);
    expect(isAlternativeTime(undefined, "2026-10-27T13:45:00.000Z", tz)).toBe(false);
  });

  it("shows proposals in local time and does not call an available requested time unavailable", async () => {
    const r = await runAgent({ message: `Book cleaning ${date} at 5pm with Omar`, customerPhone: "0505550001" }, { db, llm: scripted("omar") });
    expect(r.pendingAction?.calls[0].args.starts_at).toBe(zonedToUtc(date, "17:00", tz).toISOString());
    expect(r.reply).toContain(`${date} 17:00 (Asia/Dubai)`);
    expect(r.reply).not.toMatch(/UTC|13:00/);
    expect(r.reply).not.toMatch(/unavailable|alternative/i);
    const yes = await runAgent({ conversationId: r.conversationId, message: "yes" }, { db });
    expect(yes.reply).toContain(`${date} 17:00 (Asia/Dubai)`);
  });

  it("flags a real conflict as an alternative, shown in local time", async () => {
    // Sara has a seeded 17:00–17:45 local cleaning, so the first slot after 17:00 is 17:45 local.
    const r = await runAgent({ message: `Book cleaning ${date} at 5pm with Sara`, customerPhone: "0505550002" }, { db, llm: scripted("Sara") });
    expect(r.pendingAction?.calls[0].args.starts_at).toBe(zonedToUtc(date, "17:45", tz).toISOString());
    expect(r.reply).toMatch(/unavailable/i);
    expect(r.reply).toContain(`${date} 17:45 (Asia/Dubai)`);
    expect(r.reply).not.toMatch(/UTC/);
  });

  it("lookup_customer returns local start times", async () => {
    const r = await executeTool("lookup_customer", { phone: "0501234567" }, { db, conversationId: randomUUID() });
    const appts = r.appointments as { starts_at: string; starts_at_local: string }[];
    expect(r.timezone).toBe(tz);
    expect(appts.length).toBeGreaterThan(0);
    for (const a of appts) {
      expect(a.starts_at_local).toBe(toZonedIso(new Date(a.starts_at), tz));
      expect(a.starts_at_local).toMatch(/\+04:00$/);
    }
  });
});

describe("proposal validation", () => {
  let db: Database;
  let date: string;
  beforeAll(async () => {
    db = await createDatabase("memory://");
    let d = new Date(Date.now() + 3 * 86400000);
    while (zonedParts(d, "UTC").weekday === 5) d = new Date(+d + 86400000);
    date = zonedParts(d, "UTC").date;
  });
  afterAll(() => db?.close());

  it("never asks the customer to confirm a taken slot; the planner gets the error and re-plans", async () => {
    const seen: unknown[] = [];
    const llm: LLM = {
      mode: "mock",
      async plan(c) {
        seen.push(c.results.map((r) => r.result));
        // First attempt: Sara's seeded 17:00 slot (taken). Second attempt: the free 17:45 slot.
        const taken = !c.results.some((r) => r.call.name === "proposal_rejected" || r.result.executed === false);
        return { calls: [{ name: "book_appointment", args: { service: "cleaning", staff: "sara", starts_at: `${date}T${taken ? "17:00" : "17:45"}:00.000Z` } }] };
      },
    };
    const before = (await db.query("SELECT count(*)::int AS n FROM concierge_appointments")).rows[0];
    const r = await runAgent({ message: "Book cleaning at 5pm with Sara", customerPhone: "0505550003" }, { db, llm });
    expect(r.pendingAction?.calls[0].args.starts_at).toBe(`${date}T17:45:00.000Z`);
    const rejected = r.trace.find((t) => t.tool === "proposal_rejected");
    expect(rejected?.kind).toBe("guardrail");
    expect(String(rejected?.result.error)).toMatch(/no longer available/);
    expect(r.trace.filter((t) => t.tool === "book_appointment").every((t) => t.kind === "confirm" && t.result.executed === false)).toBe(true);
    expect((await db.query("SELECT count(*)::int AS n FROM concierge_appointments")).rows[0]).toEqual(before);
    expect(seen).toHaveLength(2);
  });
});

describe("write ordering", () => {
  it("runs a $previous reminder after the move it refers to", async () => {
    const { orderWrites } = await import("../src/lib/agent/loop");
    const move = { name: "reschedule_appointment", args: { appointment_id: "a1", starts_at: "2026-11-01T17:45:00.000Z" } };
    const remind = { name: "create_reminder", args: { appointment_id: "$previous" } };
    expect(orderWrites([remind, move]).map((c) => c.name)).toEqual(["reschedule_appointment", "create_reminder"]);
    expect(orderWrites([move, remind])).toEqual([move, remind]);
    const other = { name: "create_reminder", args: { appointment_id: "a2" } };
    expect(orderWrites([other, move])).toEqual([other, move]);
    expect(orderWrites([remind])).toEqual([remind]);
  });
});
