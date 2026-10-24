import { getDb } from "@/lib/db";
import { json, options } from "@/lib/http";
import { businessTimeZone } from "@/lib/agent/tools";
import { zonedToUtc, todayIn } from "@/lib/time";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(request: Request) {
  const url = new URL(request.url);
  const db = await getDb();
  const timezone = await businessTimeZone(db);
  const from = url.searchParams.get("from") || todayIn(timezone);
  const to =
    url.searchParams.get("to") ||
    todayIn(timezone, new Date(Date.now() + 7 * 86400000));
  if (
    ![from, to].every(
      (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(+new Date(d)),
    ) ||
    to < from
  )
    return json({ error: "Invalid date range" }, 400);
  const appointments = (
    await db.query(
      `SELECT a.*,c.name AS customer_name,s.name AS service_name,s.name_ar AS service_name_ar,p.name AS staff_name FROM concierge_appointments a JOIN concierge_customers c ON c.id=a.customer_id JOIN concierge_services s ON s.id=a.service_id JOIN concierge_staff p ON p.id=a.staff_id WHERE a.starts_at >= $1 AND a.starts_at < $2 AND a.status='booked' ORDER BY a.starts_at`,
      [zonedToUtc(from, "00:00", timezone).toISOString(), zonedToUtc(to, "00:00", timezone).toISOString()],
    )
  ).rows;
  return json({ appointments, timezone });
}
