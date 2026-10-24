import { getDb } from "@/lib/db";
import { json, options } from "@/lib/http";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET() {
  const db = await getDb();
  const counts = (
    await db.query<{
      agent_bookings: number;
      conversations: number;
      handoff_conversations: number;
      guardrail_blocks: number;
      turns: number;
      tool_steps: number;
    }>(
      `SELECT (SELECT count(*)::int FROM concierge_appointments WHERE source='agent' AND status='booked') AS agent_bookings,(SELECT count(*)::int FROM concierge_conversations) AS conversations,(SELECT count(DISTINCT conversation_id)::int FROM concierge_handoffs) AS handoff_conversations,(SELECT count(*)::int FROM concierge_tool_calls WHERE kind='guardrail') AS guardrail_blocks,(SELECT count(*)::int FROM concierge_messages WHERE role='user') AS turns,(SELECT count(*)::int FROM concierge_tool_calls WHERE kind='tool') AS tool_steps`,
    )
  ).rows[0];
  const languages = (
    await db.query(
      "SELECT lang,count(*)::int AS count FROM concierge_conversations GROUP BY lang ORDER BY lang",
    )
  ).rows;
  return json({
    mode:
      process.env.GEMINI_API_KEY && process.env.CONCIERGE_MOCK !== "1"
        ? "gemini"
        : "mock",
    ...counts,
    handoff_rate: counts.conversations
      ? counts.handoff_conversations / counts.conversations
      : 0,
    avg_tool_steps: counts.turns ? counts.tool_steps / counts.turns : 0,
    languages,
  });
}
