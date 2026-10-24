import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/lib/db";
import { addDays, isoDay } from "../src/lib/db/seed";
import { executeTool } from "../src/lib/agent/tools";
import { runAgent } from "../src/lib/agent/loop";
import { randomUUID } from "node:crypto";
let db: Database;
let date: string;
const cid = randomUUID();
beforeAll(async () => {
  db = await createDatabase();
  let d = addDays(new Date(), 2);
  while (d.getUTCDay() === 5) d = addDays(d, 1);
  date = isoDay(d);
  await db.query(
    "INSERT INTO concierge_conversations (id,customer_id) VALUES ($1,'amina')",
    [cid],
  );
});
afterAll(async () => {
  await db?.close();
});
const ctx = () => ({ db, conversationId: cid, customerId: "amina" });
describe("availability and conflicts", () => {
  it("excludes occupied slots and offers alternatives", async () => {
    const r = await executeTool(
      "check_availability",
      {
        service: "cleaning",
        date_from: date,
        date_to: date,
        after_time: "17:00",
        staff: "sara",
      },
      ctx(),
    );
    const slots = r.slots as { starts_at: string }[];
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].starts_at).toBe(`${date}T17:45:00.000Z`);
  });
  it("rejects an overlapping booking", async () => {
    const r = await executeTool(
      "book_appointment",
      { service: "cleaning", staff: "sara", starts_at: `${date}T17:15:00Z` },
      ctx(),
    );
    expect(r.error).toMatch(/available/);
  });
  it("allows a booking exactly at the end of another", async () => {
    const r = await executeTool(
      "book_appointment",
      { service: "cleaning", staff: "sara", starts_at: `${date}T17:45:00Z` },
      ctx(),
    );
    expect(r.status).toBe("booked");
  });
  it("enforces closing time and service eligibility", async () => {
    expect(
      (
        await executeTool(
          "book_appointment",
          {
            service: "cleaning",
            staff: "sara",
            starts_at: `${date}T19:30:00Z`,
          },
          ctx(),
        )
      ).error,
    ).toBeTruthy();
    expect(
      (
        await executeTool(
          "book_appointment",
          { service: "facial", staff: "sara", starts_at: `${date}T13:00:00Z` },
          ctx(),
        )
      ).error,
    ).toBeTruthy();
  });
  it("returns no slots on a closed Friday", async () => {
    let d = addDays(new Date(), 1);
    while (d.getUTCDay() !== 5) d = addDays(d, 1);
    const f = isoDay(d);
    const r = await executeTool(
      "check_availability",
      { service: "cleaning", date_from: f, date_to: f },
      ctx(),
    );
    expect(r.slots).toEqual([]);
  });
  it("rejects unbounded searches and invalid arguments", async () => {
    expect(
      (
        await executeTool(
          "check_availability",
          {
            service: "cleaning",
            date_from: date,
            date_to: isoDay(addDays(new Date(`${date}T00:00:00Z`), 40)),
          },
          ctx(),
        )
      ).error,
    ).toBeTruthy();
    expect(
      (
        await executeTool(
          "book_appointment",
          { service: "cleaning", starts_at: "bad" },
          ctx(),
        )
      ).error,
    ).toBe("Invalid tool arguments");
  });
  it("does not let a different customer cancel an appointment", async () => {
    const a = (
      await db.query<{ id: string }>(
        "SELECT id FROM concierge_appointments WHERE customer_id='yousef' LIMIT 1",
      )
    ).rows[0];
    expect(
      (await executeTool("cancel_appointment", { appointment_id: a.id }, ctx()))
        .error,
    ).toMatch(/matching/);
  });
});
describe("confirmation integrity", () => {
  it("does not write until confirmation and handles duplicate clicks once", async () => {
    const p = await runAgent(
      { message: `Book a facial ${date} at 11am`, customerPhone: "0501112222" },
      { db },
    );
    expect(p.pendingAction).toBeDefined();
    expect(
      (
        await db.query(
          "SELECT id FROM concierge_appointments WHERE source='agent' AND service_id='facial'",
        )
      ).rows,
    ).toHaveLength(0);
    const replies = await Promise.all([
      runAgent(
        { conversationId: p.conversationId, message: "yes", confirm: true },
        { db },
      ),
      runAgent(
        { conversationId: p.conversationId, message: "yes", confirm: true },
        { db },
      ),
    ]);
    expect(replies[0].reply).toMatch(/Confirmed/);
    expect(replies[1].reply).toMatch(/no pending/);
    expect(
      (
        await db.query(
          "SELECT id FROM concierge_appointments WHERE source='agent' AND service_id='facial'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("rechecks a slot when confirming", async () => {
    const p = await runAgent(
      {
        message: `Book a cleaning ${date} at 12pm with Sara`,
        customerPhone: "0501113333",
      },
      { db },
    );
    const a = p.pendingAction!.calls[0].args;
    await executeTool("book_appointment", a, ctx());
    const result = await runAgent(
      { conversationId: p.conversationId, message: "yes" },
      { db },
    );
    expect(result.reply).toMatch(/not saved/);
    expect(result.trace.find((t) => t.kind === "confirm")?.result.status).toBe(
      "failed",
    );
  });
  it("rolls back an entire bundle if a later reminder is invalid", async () => {
    const p = await runAgent(
      {
        message: `Book a cleaning ${date} at 14pm with Sara and remind me`,
        customerPhone: "0501114444",
      },
      { db },
    );
    const pending = p.pendingAction!;
    expect(pending.calls).toHaveLength(2);
    pending.calls[1].args.remind_at = "2000-01-01T00:00:00Z";
    await db.query(
      "UPDATE concierge_conversations SET pending_action=$2 WHERE id=$1",
      [p.conversationId, JSON.stringify(pending)],
    );
    const before = Number(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM concierge_appointments",
        )
      ).rows[0].n,
    );
    const result = await runAgent(
      { conversationId: p.conversationId, message: "yes" },
      { db },
    );
    expect(result.reply).toMatch(/not saved/);
    expect(
      (
        await db.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM concierge_appointments",
        )
      ).rows[0].n,
    ).toBe(before);
    expect(
      result.trace.find((t) => t.tool === "book_appointment")?.result
        .rolled_back,
    ).toBe(true);
  });
  it("a refusal clears the pending action", async () => {
    const p = await runAgent(
      { message: `Book a facial ${date} at 16pm`, customerPhone: "0501115555" },
      { db },
    );
    expect(p.pendingAction).toBeDefined();
    const no = await runAgent(
      { conversationId: p.conversationId, message: "no" },
      { db },
    );
    expect(no.trace[0].result.status).toBe("declined");
    const yes = await runAgent(
      { conversationId: p.conversationId, message: "yes" },
      { db },
    );
    expect(yes.reply).toMatch(/no pending/);
  });
});
