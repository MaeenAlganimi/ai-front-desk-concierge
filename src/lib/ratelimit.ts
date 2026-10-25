/**
 * Per-visitor caps to protect the shared Gemini quota. Over the live-AI budget a visitor still gets the
 * guided demo; over the hard cap requests are refused for a short while.
 */
const hits = new Map<string, number[]>();
const WINDOW = 60 * 60_000;
export const LIVE_PER_HOUR = Number(process.env.CONCIERGE_LIVE_PER_HOUR ?? 20);
export const HARD_PER_HOUR = Number(process.env.CONCIERGE_HARD_PER_HOUR ?? 80);
export function visitorId(request: Request) {
  const fwd = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || request.headers.get("x-real-ip") || "local";
}
export function checkVisitor(id: string, now = Date.now()) {
  const recent = (hits.get(id) || []).filter((t) => now - t < WINDOW);
  if (recent.length >= HARD_PER_HOUR) {
    hits.set(id, recent);
    return { allowed: false as const, live: false, retryAfter: Math.ceil((recent[0] + WINDOW - now) / 1000) };
  }
  recent.push(now);
  hits.set(id, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW)) hits.delete(k);
  return { allowed: true as const, live: recent.length <= LIVE_PER_HOUR, retryAfter: 0 };
}
export function resetRateLimit() {
  hits.clear();
}
