/**
 * Gemini key pool. GEMINI_API_KEYS is a comma-separated list (GEMINI_API_KEY is also accepted).
 * A key that hits a quota/429, an auth error or a timeout is rested for a while and the next key is used.
 */
const cooling = new Map<string, number>();
let cursor = 0;

export function geminiKeys(): string[] {
  const raw = [process.env.GEMINI_API_KEYS || "", process.env.GEMINI_API_KEY || ""].join(",");
  return [...new Set(raw.split(",").map((k) => k.trim()).filter(Boolean))];
}
export function hasGeminiKeys() {
  return geminiKeys().length > 0 && process.env.CONCIERGE_MOCK !== "1";
}
export function availableKeys(now = Date.now()): string[] {
  const keys = geminiKeys();
  const start = cursor % Math.max(1, keys.length);
  return [...keys.slice(start), ...keys.slice(0, start)].filter((k) => (cooling.get(k) || 0) <= now);
}
/** Classifies an error as one that should move on to another key. */
export function isRotatable(error: unknown) {
  const msg = String(error);
  return (
    /429|RESOURCE_EXHAUSTED|quota|rate limit|PerDay|per day|401|403|PERMISSION_DENIED|API key not valid|API_KEY_INVALID|500|503|UNAVAILABLE|overloaded|abort|timeout|timed out/i.test(msg) ||
    (error as { name?: string })?.name === "TimeoutError"
  );
}
export function restKey(key: string, error: unknown, now = Date.now()) {
  const msg = String(error);
  const ms = /PerDay|per day|401|403|API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)
    ? 60 * 60_000
    : /429|RESOURCE_EXHAUSTED|quota/i.test(msg)
      ? 10 * 60_000
      : 2 * 60_000;
  cooling.set(key, now + ms);
  const keys = geminiKeys();
  cursor = (keys.indexOf(key) + 1) % Math.max(1, keys.length);
}
export class AllKeysFailed extends Error {
  constructor(last?: unknown) {
    super(`All Gemini keys unavailable: ${String(last ?? "none ready").slice(0, 200)}`);
  }
}
/** Runs fn with each ready key in turn until one succeeds. */
export async function withKeys<T>(fn: (key: string) => Promise<T>): Promise<T> {
  let last: unknown;
  for (const key of availableKeys()) {
    try {
      return await fn(key);
    } catch (error) {
      if (!isRotatable(error)) throw error;
      last = error;
      restKey(key, error);
    }
  }
  throw new AllKeysFailed(last);
}
export function resetKeyPool() {
  cooling.clear();
  cursor = 0;
}
