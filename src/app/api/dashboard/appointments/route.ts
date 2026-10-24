import { getDb } from "@/lib/db";
import { json, options } from "@/lib/http";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from =
    url.searchParams.get("from") || new Date().toISOString().slice(0, 10);
  const to =
    url.searchParams.get("to") ||
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  if (
    ![from, to].every(
      (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(+new Date(d)),
    ) ||
    to < from
  )
    return json({ error: "Invalid date range" }, 400);
  const db = await getDb();
  const appointments = (
    await db.query(
      `SELECT a.*,c.name AS customer_name,s.name AS service_name,s.name_ar AS service_name_ar,p.name AS staff_name FROM concierge_appointments a JOIN concierge_customers c ON c.id=a.customer_id JOIN concierge_services s ON s.id=a.service_id JOIN concierge_staff p ON p.id=a.staff_id WHERE a.starts_at >= $1::date AND a.starts_at < $2::date AND a.status='booked' ORDER BY a.starts_at`,
      [from, to],
    )
  ).rows;
  return json({ appointments });
}
