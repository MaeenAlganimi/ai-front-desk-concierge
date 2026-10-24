import { writeFile } from "node:fs/promises";
import { createDatabase } from "../src/lib/db";
import { scenarios } from "./scenarios";
async function main() {
  const live = process.argv.includes("--live");
  if (live) {
    if (!process.env.GEMINI_API_KEY)
      throw new Error("evals:live requires GEMINI_API_KEY");
    delete process.env.CONCIERGE_MOCK;
  } else process.env.CONCIERGE_MOCK = "1";
  const results: {
    scenario: string;
    status: string;
    ms: number;
    details: string;
  }[] = [];
  for (const scenario of scenarios) {
    const start = performance.now();
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
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await db?.close();
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
    "evals/results.md",
    `# Concierge evaluation results\n\nMode: ${live ? "Gemini live" : "Deterministic mock"} · ${new Date().toISOString()}\n\n${passed}/${results.length} scenarios passed. Each scenario used a fresh in-memory PGlite database.\n\n| Scenario | Result | Duration | Details |\n| --- | --- | --- | --- |\n${results.map((r) => `| ${escape(r.scenario)} | ${r.status} | ${r.ms} ms | ${escape(r.details)} |`).join("\n")}\n`,
  );
  if (passed !== results.length) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
