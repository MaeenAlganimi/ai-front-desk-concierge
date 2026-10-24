import { getDb } from "@/lib/db";
import { json, options } from "@/lib/http";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET() {
  const db = await getDb();
  return json({
    conversations: (
      await db.query(
        `SELECT c.*,p.name AS customer_name,p.phone,(SELECT content FROM concierge_messages WHERE conversation_id=c.id ORDER BY turn DESC,created_at DESC LIMIT 1) AS preview FROM concierge_conversations c LEFT JOIN concierge_customers p ON p.id=c.customer_id ORDER BY c.updated_at DESC LIMIT 100`,
      )
    ).rows,
  });
}
