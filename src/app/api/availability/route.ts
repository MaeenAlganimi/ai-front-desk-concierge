import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { json, options } from "@/lib/http";
import { businessTimeZone } from "@/lib/agent/tools";
import { todayIn, zonedParts, zonedToUtc } from "@/lib/time";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
/** Public, anonymised busy blocks for the next few days. No customer data. */
export async function GET() {
  const db = await getDb();
  const timezone = await businessTimeZone(db);
  const from = todayIn(timezone);
  const to = todayIn(timezone, new Date(Date.now() + 6 * 86400000));
  const rows = (
    await db.query<{ id: string; staff_id: string; staff_name: string; starts_at: Date; ends_at: Date }>(
      `SELECT a.id,a.staff_id,p.name AS staff_name,a.starts_at,a.ends_at FROM concierge_appointments a JOIN concierge_staff p ON p.id=a.staff_id WHERE a.status='booked' AND a.starts_at >= $1 AND a.starts_at < $2 ORDER BY a.starts_at`,
      [zonedToUtc(from, "00:00", timezone).toISOString(), zonedToUtc(to, "00:00", timezone).toISOString()],
    )
  ).rows;
  const blocks = rows.map((r) => {
    const s = zonedParts(new Date(r.starts_at), timezone);
    const e = zonedParts(new Date(r.ends_at), timezone);
    return {
      key: createHash("sha256").update(String(r.id)).digest("hex").slice(0, 12),
      staff: r.staff_id,
      staffName: r.staff_name,
      date: s.date,
      start: s.time.slice(0, 5),
      end: e.time.slice(0, 5),
    };
  });
  return json({ timezone, from, to, blocks });
}
