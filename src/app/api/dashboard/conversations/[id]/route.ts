import { getDb } from "@/lib/db";
import { json, options } from "@/lib/http";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await getDb();
  const conversation = (
    await db.query("SELECT * FROM concierge_conversations WHERE id=$1", [id])
  ).rows[0];
  if (!conversation) return json({ error: "Conversation not found" }, 404);
  const messages = (
    await db.query(
      "SELECT * FROM concierge_messages WHERE conversation_id=$1 ORDER BY turn,created_at",
      [id],
    )
  ).rows;
  const trace = (
    await db.query(
      "SELECT * FROM concierge_tool_calls WHERE conversation_id=$1 ORDER BY turn,step",
      [id],
    )
  ).rows;
  return json({ conversation, messages, trace });
}
