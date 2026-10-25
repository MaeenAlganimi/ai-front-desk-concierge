import { writeFile } from "node:fs/promises";
import { createDatabase } from "../src/lib/db";
import { scenarios } from "./scenarios";
async function main() {
  const live = process.argv.includes("--live");
  if (live) {
    if (!process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEYS)
      throw new Error("evals:live requires GEMINI_API_KEY");
    delete process.env.CONCIERGE_MOCK;
  } else process.env.CONCIERGE_MOCK = "1";
  const results: {
    scenario: string;
    status: string;
    ms: number;
    details: string;
  }[] = [];
  let quotaHit = false;
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",").map(Number);
  for (const [index, scenario] of scenarios.entries()) {
    if (only && !only.includes(index + 1)) continue;
    if (quotaHit) {
      results.push({ scenario: scenario.name, status: "SKIP", ms: 0, details: "Not run: Gemini quota exhausted (429)" });
      console.log(`SKIP  ${scenario.name} (quota)`);
      continue;
    }
    if (live && results.length) await new Promise((r) => setTimeout(r, Number(process.env.EVAL_GAP_MS ?? 20000)));
    let attempt = 0;
    retry: for (;;) {
    const start = performance.now();
    (globalThis as { __lastLlmError?: string }).__lastLlmError = undefined;
    let db;
    try {
      db = await createDatabase("memory://");
      await scenario.run(db);
      results.push({
        scenario: scenario.name,
        status: "PASS",
        ms: Math.round(performance.now() - start),
        details: "",
      });
    } catch (error) {
      results.push({
        scenario: scenario.name,
        status: "FAIL",
        ms: Math.round(performance.now() - start),
        details: (error instanceof Error ? error.message : String(error)) + ((globalThis as { __lastLlmError?: string }).__lastLlmError ? ` [LLM error: ${(globalThis as { __lastLlmError?: string }).__lastLlmError}]` : ""),
      });
    } finally {
      await db?.close();
    }
    const row = results.at(-1)!;
    if (live && row.status === "FAIL" && /429|RESOURCE_EXHAUSTED|quota|503|UNAVAILABLE/i.test(row.details)) {
      if (attempt++ < 2) {
        console.log(`RETRY ${scenario.name} after transient Gemini error; waiting 65s`);
        results.pop();
        await new Promise((r) => setTimeout(r, 65000));
        continue retry;
      }
      if (/429|RESOURCE_EXHAUSTED|quota/i.test(row.details)) quotaHit = true;
    }
    break;
    }
    const row = results.at(-1)!;
    console.log(`${row.status.padEnd(4)}  ${row.scenario} (${row.ms}ms)`);
    if (row.details) console.error(row.details);
  }
  console.table(
    results.map(({ scenario, status, ms }) => ({ scenario, status, ms })),
  );
  const escape = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const passed = results.filter((r) => r.status === "PASS").length;
  await writeFile(
    live ? "evals/results-live.md" : "evals/results.md",
    `# Concierge evaluation results\n\nMode: ${live ? "Gemini live" : "Deterministic mock"} · ${new Date().toISOString()}\n\n${passed}/${results.length} scenarios passed. Each scenario used a fresh in-memory PGlite database.${quotaHit ? " Run stopped early: Gemini returned 429 (quota exhausted); remaining scenarios were skipped, not retried." : ""}\n\n| Scenario | Result | Duration | Details |\n| --- | --- | --- | --- |\n${results.map((r) => `| ${escape(r.scenario)} | ${r.status} | ${r.ms} ms | ${escape(r.details)} |`).join("\n")}\n`,
  );
  if (passed !== results.length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
