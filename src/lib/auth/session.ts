// Stateless signed staff session (HMAC-SHA256 via Web Crypto so it runs in middleware).
export const SESSION_COOKIE = "qc_staff_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;
const enc = new TextEncoder();

function secret() {
  const s = process.env.SESSION_SECRET || process.env.STAFF_PASSWORD;
  return s && s.length > 0 ? s : null;
}
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmac(data: string, key: string) {
  const k = await crypto.subtle.importKey(
    "raw",
    enc.encode(`qudra-concierge:${key}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}

export function safeEqual(a: string, b: string) {
  const x = enc.encode(a),
    y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    diff |= (x[i % (x.length || 1)] ?? 0) ^ (y[i % (y.length || 1)] ?? 0);
  return diff === 0;
}

export function authConfigured() {
  return !!process.env.STAFF_PASSWORD;
}

export async function checkPassword(input: string) {
  const expected = process.env.STAFF_PASSWORD;
  if (!expected) return false;
  // compare digests so length isn't leaked
  return safeEqual(await hmac(input, "pw"), await hmac(expected, "pw"));
}

export async function createSession(now = Date.now()) {
  const key = secret();
  if (!key) throw new Error("STAFF_PASSWORD is not configured");
  const payload = `staff.${Math.floor(now / 1000) + SESSION_TTL_SECONDS}.${b64url(crypto.getRandomValues(new Uint8Array(12)).buffer)}`;
  return `${payload}.${await hmac(payload, key)}`;
}

export async function verifySession(token: string | undefined, now = Date.now()) {
  const key = secret();
  if (!key || !token) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const [role, exp] = payload.split(".");
  if (role !== "staff" || !/^\d+$/.test(exp || "")) return false;
  if (Number(exp) * 1000 <= now) return false;
  return safeEqual(token.slice(i + 1), await hmac(payload, key));
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
