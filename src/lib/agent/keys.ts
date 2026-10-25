/**
 * Single Gemini key. This app uses exactly one key from its own Google Cloud project (GEMINI_API_KEY).
 * There is deliberately no multi-key rotation. When the key hits quota, an auth error or a timeout,
 * it is rested for a while and the assistant answers in guided demo mode instead.
 */
let restedUntil = 0;

export function geminiKeys(): string[] {
  const key = (process.env.GEMINI_API_KEY || "").trim();
  return key ? [key] : [];
}
export function hasGeminiKeys() {
  return geminiKeys().length > 0 && process.env.CONCIERGE_MOCK !== "1";
}
export function availableKeys(now = Date.now()): string[] {
  return restedUntil <= now ? geminiKeys() : [];
}
/** Errors that mean the key should rest (and guided mode take over). */
export function isRotatable(error: unknown) {
  const msg = String(error);
  return (
    /429|RESOURCE_EXHAUSTED|quota|rate limit|PerDay|per day|401|403|PERMISSION_DENIED|API key not valid|API_KEY_INVALID|500|503|UNAVAILABLE|overloaded|abort|timeout|timed out/i.test(msg) ||
    (error as { name?: string })?.name === "TimeoutError"
  );
}
export function restKey(_key: string, error: unknown, now = Date.now()) {
  const msg = String(error);
  const ms = /PerDay|per day|401|403|API key not valid|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg)
    ? 60 * 60_000
    : /429|RESOURCE_EXHAUSTED|quota/i.test(msg)
      ? 10 * 60_000
      : 2 * 60_000;
  restedUntil = now + ms;
}
export class AllKeysFailed extends Error {
  constructor(last?: unknown) {
    super(`Gemini key unavailable: ${String(last ?? "resting").slice(0, 200)}`);
  }
}
/** Runs fn with the single key; on quota/timeout the key rests and the caller falls back to guided mode. */
export async function withKeys<T>(fn: (key: string) => Promise<T>): Promise<T> {
  const [key] = availableKeys();
  if (!key) throw new AllKeysFailed();
  try {
    return await fn(key);
  } catch (error) {
    if (!isRotatable(error)) throw error;
    restKey(key, error);
    throw new AllKeysFailed(error);
  }
}
export function resetKeyPool() {
  restedUntil = 0;
}
