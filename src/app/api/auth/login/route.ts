import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  authConfigured,
  checkPassword,
  cookieOptions,
  createSession,
} from "@/lib/auth/session";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { n: number; reset: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  if (!authConfigured())
    return NextResponse.json(
      { error: "Staff login is not configured (set STAFF_PASSWORD)" },
      { status: 503 },
    );
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.reset > now && a.n >= MAX_ATTEMPTS)
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {}
  if (!(await checkPassword(password))) {
    const cur = a && a.reset > now ? a : { n: 0, reset: now + WINDOW_MS };
    cur.n++;
    attempts.set(ip, cur);
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), cookieOptions);
  return res;
}
