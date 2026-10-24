import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkPassword, createSession, verifySession, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../src/lib/auth/session";
import { middleware } from "../src/middleware";
import { POST as login } from "../src/app/api/auth/login/route";

const saved = { ...process.env };
beforeEach(() => {
  process.env.STAFF_PASSWORD = "correct horse battery";
  delete process.env.SESSION_SECRET;
});
afterEach(() => {
  process.env = { ...saved };
});
const req = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost${path}`, cookie ? { headers: { cookie: `${SESSION_COOKIE}=${cookie}` } } : {});

describe("staff session", () => {
  it("checks the password from STAFF_PASSWORD", async () => {
    expect(await checkPassword("correct horse battery")).toBe(true);
    expect(await checkPassword("wrong")).toBe(false);
    expect(await checkPassword("")).toBe(false);
  });
  it("fails closed when STAFF_PASSWORD is unset", async () => {
    delete process.env.STAFF_PASSWORD;
    expect(await checkPassword("")).toBe(false);
    expect(await verifySession("staff.9999999999.x.y")).toBe(false);
    await expect(createSession()).rejects.toThrow();
  });
  it("signs, verifies, rejects tampering and expiry", async () => {
    const t = await createSession();
    expect(await verifySession(t)).toBe(true);
    const parts = t.split(".");
    parts[1] = String(Number(parts[1]) + 1000);
    expect(await verifySession(parts.join("."))).toBe(false);
    expect(await verifySession(t, Date.now() + (SESSION_TTL_SECONDS + 5) * 1000)).toBe(false);
    process.env.STAFF_PASSWORD = "rotated";
    expect(await verifySession(t)).toBe(false);
  });
});

describe("middleware protects dashboard pages and APIs", () => {
  it("returns 401 for dashboard APIs without a session", async () => {
    const r = await middleware(req("/api/dashboard/appointments"));
    expect(r.status).toBe(401);
  });
  it("redirects dashboard page to login", async () => {
    const r = await middleware(req("/dashboard"));
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toContain("/login?next=%2Fdashboard");
  });
  it("lets a valid session through and rejects a forged one", async () => {
    const ok = await middleware(req("/api/dashboard/handoffs", await createSession()));
    expect(ok.headers.get("x-middleware-next")).toBe("1");
    const bad = await middleware(req("/api/dashboard/handoffs", "staff.9999999999.abc.forged"));
    expect(bad.status).toBe(401);
  });
});

describe("login route", () => {
  const post = (password: string, ip = "1.2.3.4") =>
    login(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ password }),
    }));
  it("sets an httpOnly session cookie on success", async () => {
    const r = await post("correct horse battery");
    expect(r.status).toBe(200);
    const c = r.headers.get("set-cookie") || "";
    expect(c).toContain(`${SESSION_COOKIE}=`);
    expect(c.toLowerCase()).toContain("httponly");
  });
  it("rejects a wrong password and rate-limits", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await post("nope", "9.9.9.9")).status;
    expect(last).toBe(429);
    expect((await post("nope", "8.8.8.8")).status).toBe(401);
  });
});
