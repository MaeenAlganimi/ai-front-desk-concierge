import { afterEach, describe, expect, it } from "vitest";
import { availableKeys, geminiKeys, resetKeyPool, withKeys } from "../src/lib/agent/keys";
import { FallbackLLM, MockLLM, type LLM } from "../src/lib/agent/llm";
import { checkVisitor, resetRateLimit, LIVE_PER_HOUR } from "../src/lib/ratelimit";

const ctx = { message: "How much is a cleaning?", lang: "en" as const, history: [], results: [], today: "2026-10-26" };
afterEach(() => {
  delete process.env.GEMINI_API_KEYS;
  delete process.env.GEMINI_API_KEY;
  resetKeyPool();
  resetRateLimit();
});
describe("single key", () => {
  it("uses only GEMINI_API_KEY and ignores GEMINI_API_KEYS", () => {
    process.env.GEMINI_API_KEYS = "a,b,c";
    process.env.GEMINI_API_KEY = "only";
    expect(geminiKeys()).toEqual(["only"]);
  });
  it("does not try another key on quota errors; the key rests instead", async () => {
    process.env.GEMINI_API_KEY = "only";
    const tried: string[] = [];
    await expect(withKeys(async (k) => { tried.push(k); throw new Error("429 RESOURCE_EXHAUSTED quota"); })).rejects.toThrow();
    expect(tried).toEqual(["only"]);
    expect(availableKeys()).toEqual([]);
  });
  it("does not rest the key on non-quota errors", async () => {
    process.env.GEMINI_API_KEY = "only";
    await expect(withKeys(async () => { throw new Error("400 bad request"); })).rejects.toThrow("400");
    expect(availableKeys()).toEqual(["only"]);
  });
});
describe("guided fallback", () => {
  it("switches to the scripted planner when live AI fails", async () => {
    process.env.GEMINI_API_KEYS = "a";
    process.env.GEMINI_API_KEY = "only";
    const broken: LLM = { mode: "gemini", plan: async () => { throw new Error("All Gemini keys unavailable"); } };
    const llm = new FallbackLLM(broken, new MockLLM());
    expect(llm.mode).toBe("gemini");
    const plan = await llm.plan(ctx);
    expect(llm.mode).toBe("guided");
    expect(plan.calls?.[0].name).toBe("answer_from_knowledge_base");
  });
  it("starts guided when forced", () => {
    process.env.GEMINI_API_KEYS = "a";
    expect(new FallbackLLM(new MockLLM(), new MockLLM(), true).mode).toBe("guided");
  });
});
describe("per-visitor cap", () => {
  it("moves a heavy visitor to guided mode before refusing", () => {
    let r = checkVisitor("v");
    for (let i = 1; i < LIVE_PER_HOUR; i++) r = checkVisitor("v");
    expect(r.live).toBe(true);
    expect(checkVisitor("v").live).toBe(false);
    expect(checkVisitor("other").live).toBe(true);
  });
});
describe("turn budget", () => {
  it("answers in guided mode when live AI is too slow", async () => {
    process.env.GEMINI_API_KEYS = "a";
    process.env.CONCIERGE_LIVE_BUDGET_MS = "50";
    const slow: LLM = { mode: "gemini", plan: () => new Promise((r) => setTimeout(() => r({ reply: "late" }), 1000)) };
    const llm = new FallbackLLM(slow, new MockLLM());
    const plan = await llm.plan(ctx);
    delete process.env.CONCIERGE_LIVE_BUDGET_MS;
    expect(llm.mode).toBe("guided");
    expect(plan.reply).not.toBe("late");
  });
});
