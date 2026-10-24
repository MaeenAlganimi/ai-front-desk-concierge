"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = params.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (r.ok) router.replace(target);
    else setError((await r.json().catch(() => ({}))).error || "Login failed");
  }
  return (
    <form onSubmit={submit} style={{ maxWidth: 360, margin: "15vh auto", display: "grid", gap: 12, padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>Staff login</h1>
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Staff password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        style={{ padding: 10, border: "1px solid #ccc", borderRadius: 8 }}
      />
      {error && <p role="alert" style={{ color: "#b00020" }}>{error}</p>}
      <button disabled={busy} style={{ padding: 10, borderRadius: 8, background: "#111", color: "#fff" }}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
