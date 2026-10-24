import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, options } from "@/lib/http";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET() {
  const db = await getDb();
  return json({
    handoffs: (
      await db.query(
        `SELECT h.*,c.lang,p.name AS customer_name,p.phone FROM concierge_handoffs h JOIN concierge_conversations c ON c.id=h.conversation_id LEFT JOIN concierge_customers p ON p.id=c.customer_id ORDER BY h.created_at DESC LIMIT 100`,
      )
    ).rows,
  });
}
export async function PATCH(request: Request) {
  let body;
  try {
    body = z
      .object({ id: z.string().uuid(), status: z.literal("resolved") })
      .safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.success)
    return json({ error: "An id and resolved status are required" }, 400);
  const db = await getDb();
  const result = await db.query(
    "UPDATE concierge_handoffs SET status='resolved',resolved_at=now() WHERE id=$1 RETURNING *",
    [body.data.id],
  );
  return result.rows.length
    ? json({ handoff: result.rows[0] })
    : json({ error: "Handoff not found" }, 404);
}
