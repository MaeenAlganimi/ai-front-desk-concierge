import { z } from "zod";
import { runAgent } from "@/lib/agent/loop";
import { json, options } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
const schema = z.object({
  conversationId: z.string().uuid().optional(),
  customerPhone: z
    .string()
    .regex(/^\+?[\d\s()-]{7,24}$/)
    .optional(),
  message: z.string().trim().min(1).max(4000),
  confirm: z.boolean().optional(),
});
export async function POST(request: Request) {
  let body;
  try {
    body = schema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.success)
    return json(
      {
        error: "Invalid chat request",
        details: body.error.issues.map((i) => i.message),
      },
      400,
    );
  try {
    return json(await runAgent(body.data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/Conversation not found/.test(message))
      return json({ error: message }, 404);
    if (/phone number/.test(message)) return json({ error: message }, 400);
    console.error("Chat request failed", error);
    return json(
      { error: "Unable to process your request. Please try again." },
      500,
    );
  }
}
