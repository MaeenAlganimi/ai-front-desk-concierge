import { describe, expect, it } from "vitest";
import { MockLLM, parseIntent } from "../src/lib/agent/llm";
import type { PlannerContext } from "../src/lib/agent/types";
describe("deterministic planner parsing", () => {
  it.each([
    "ابي موعد تنظيف",
    "ابغى موعد تنظيف بكرا",
    "بدي موعد",
    "عايز موعد تنظيف",
  ])("parses dialect booking: %s", (m) =>
    expect(parseIntent(m).action).toBe("book"),
  );
  it.each(["الغي موعدي", "ألغي موعدي", "cancel my appointment"])(
    "parses cancellation: %s",
    (m) => expect(parseIntent(m).action).toBe("cancel"),
  );
  it.each([
    "أجّل موعدي",
    "غيّر موعدي",
    "move my Thursday cleaning to next week after 5pm and remind me",
  ])("parses moving: %s", (m) =>
    expect(parseIntent(m).action).toBe("reschedule"),
  );
  it("parses next week, PM, staff and a bundled reminder", () => {
    expect(
      parseIntent(
        "move my Thursday cleaning to next week after 5pm with Sara and remind me",
        "2026-10-24",
      ),
    ).toMatchObject({
      action: "reschedule",
      date: "2026-10-31",
      afterTime: "17:00",
      staff: "sara",
      reminder: true,
    });
  });
  it("parses Arabic numerals and explicit dates", () => {
    expect(
      parseIntent("ابي موعد تنظيف 2026-10-26 الساعة ٥ مساء"),
    ).toMatchObject({ date: "2026-10-26", afterTime: "17:00" });
  });
  it("recognizes Egyptian price questions", () =>
    expect(parseIntent("تنظيف الأسنان بكام؟").action).toBe("kb"));
  it("asks for a phone instead of guessing an identity", async () => {
    const p = await new MockLLM().plan({
      message: "book cleaning",
      lang: "en",
      history: [],
      results: [],
      today: "2026-10-24",
    });
    expect(p.calls).toBeUndefined();
    expect(p.reply).toMatch(/phone/);
  });
  it("emits real lookup tools", async () => {
    const c: PlannerContext = {
      message: "Book cleaning tomorrow",
      lang: "en",
      history: [],
      results: [],
      today: "2026-10-24",
      customerPhone: "0501234567",
    };
    expect((await new MockLLM().plan(c)).calls?.[0]).toEqual({
      name: "lookup_customer",
      args: { phone: "0501234567" },
    });
  });
});
