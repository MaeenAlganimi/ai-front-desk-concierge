import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { Database } from "../db";
import { embed } from "./embeddings";
import type { Args, ToolResult } from "./types";

type Queryable = Pick<Database, "query">;
export type ToolContext = {
  db: Queryable;
  conversationId: string;
  customerId?: string;
};
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
  }, "Invalid calendar date");
const timestamp = z.string().datetime({ offset: true });
export const toolSchemas = {
  check_availability: z.object({
    service: z.string(),
    date_from: day,
    date_to: day,
    after_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    staff: z.string().optional(),
  }),
  lookup_customer: z
    .object({ phone: z.string().optional(), name: z.string().optional() })
    .refine((v) => v.phone || v.name, "Phone or name required"),
  book_appointment: z.object({
    service: z.string(),
    staff: z.string(),
    starts_at: timestamp,
  }),
  reschedule_appointment: z.object({
    appointment_id: z.string(),
    starts_at: timestamp,
    staff: z.string().optional(),
  }),
  cancel_appointment: z.object({ appointment_id: z.string() }),
  create_reminder: z.object({
    appointment_id: z.string(),
    remind_at: timestamp.optional(),
  }),
  answer_from_knowledge_base: z.object({ query: z.string().min(1).max(2000) }),
  create_handoff: z.object({
    reason: z.string().min(1),
    summary: z.string().min(1),
    priority: z.enum(["normal", "urgent"]),
  }),
};
export type ToolName = keyof typeof toolSchemas;
export const writeTools = new Set([
  "book_appointment",
  "reschedule_appointment",
  "cancel_appointment",
  "create_reminder",
]);
export const toolDeclarations = Object.entries(toolSchemas).map(
  ([name, schema]) => ({
    name,
    description: (
      {
        check_availability:
          "Find available studio slots within opening hours. All dates and times are UTC studio time.",
        lookup_customer:
          "Look up customer and their booked appointments by phone or name.",
        book_appointment: "Propose booking a slot; requires user confirmation.",
        reschedule_appointment:
          "Propose moving an existing appointment; requires confirmation.",
        cancel_appointment:
          "Propose cancelling an existing appointment; requires confirmation.",
        create_reminder:
          "Propose scheduling a reminder. Use $previous as appointment_id for a new booking or move in the same plan.",
        answer_from_knowledge_base:
          "Retrieve factual studio answers with cosine similarity search.",
        create_handoff: "Create a staff follow-up request.",
      } as Record<string, string>
    )[name],
    parametersJsonSchema: z.toJSONSchema(schema, { unrepresentable: "any" }),
  }),
);

type Service = { id: string; name: string; duration_minutes: number };
type Staff = { id: string; name: string; service_ids: string[] };
type Appointment = {
  id: string;
  customer_id: string;
  service_id: string;
  staff_id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
};
async function serviceFor(db: Queryable, value: string) {
  return (
    await db.query<Service>(
      "SELECT * FROM concierge_services WHERE id=$1 OR lower(name)=lower($1) OR name_ar=$1",
      [value],
    )
  ).rows[0];
}
async function staffFor(db: Queryable, value?: string) {
  return (
    await db.query<Staff>(
      "SELECT * FROM concierge_staff WHERE ($1::text IS NULL OR id=$1 OR lower(name)=lower($1) OR name_ar=$1) ORDER BY id",
      [value || null],
    )
  ).rows;
}
async function slotAvailable(
  db: Queryable,
  service: Service,
  staff: Staff,
  start: Date,
  exclude?: string,
) {
  if (
    !staff.service_ids.includes(service.id) ||
    !Number.isFinite(start.getTime()) ||
    start.getTime() < Date.now()
  )
    return false;
  const end = new Date(start.getTime() + service.duration_minutes * 60000);
  const hours = (
    await db.query<{ opens: string; closes: string; closed: boolean }>(
      "SELECT * FROM concierge_opening_hours WHERE day=$1",
      [start.getUTCDay()],
    )
  ).rows[0];
  const time = start.toISOString().slice(11, 16);
  if (
    !hours ||
    hours.closed ||
    time < hours.opens ||
    end.toISOString().slice(0, 10) !== start.toISOString().slice(0, 10) ||
    end.toISOString().slice(11, 16) > hours.closes
  )
    return false;
  const conflicts = await db.query(
    "SELECT id FROM concierge_appointments WHERE status='booked' AND staff_id=$1 AND starts_at < $3 AND ends_at > $2 AND ($4::text IS NULL OR id<>$4)",
    [staff.id, start.toISOString(), end.toISOString(), exclude || null],
  );
  return conflicts.rows.length === 0;
}
export async function executeTool(
  name: string,
  input: Args,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!(name in toolSchemas)) return { error: "Unknown tool" };
  const parsed = toolSchemas[name as ToolName].safeParse(input);
  if (!parsed.success)
    return {
      error: "Invalid tool arguments",
      details: parsed.error.issues.map((i) => i.message),
    };
  const a = parsed.data as Args;
  const db = ctx.db;
  if (name === "check_availability") {
    const s = await serviceFor(db, a.service as string);
    if (!s) return { error: "Unknown service" };
    const from = new Date(`${a.date_from}T00:00:00Z`),
      to = new Date(`${a.date_to}T00:00:00Z`);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      to < from ||
      +to - +from > 31 * 86400000
    )
      return { error: "Choose a valid date range of at most 31 days" };
    const staff = (await staffFor(db, a.staff as string | undefined)).filter(
      (p) => p.service_ids.includes(s.id),
    );
    const slots: {
      starts_at: string;
      ends_at: string;
      staff: string;
      staff_name: string;
      service: string;
    }[] = [];
    for (
      let d = new Date(from);
      d <= to && slots.length < 24;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const hours = (
        await db.query<{ opens: string; closes: string; closed: boolean }>(
          "SELECT * FROM concierge_opening_hours WHERE day=$1",
          [d.getUTCDay()],
        )
      ).rows[0];
      if (!hours || hours.closed) continue;
      const openMinutes =
        Number(hours.opens.slice(0, 2)) * 60 + Number(hours.opens.slice(3));
      const closeMinutes =
        Number(hours.closes.slice(0, 2)) * 60 + Number(hours.closes.slice(3));
      const after = a.after_time
        ? Number(String(a.after_time).slice(0, 2)) * 60 +
          Number(String(a.after_time).slice(3))
        : 0;
      for (
        let minute = Math.max(openMinutes, after);
        minute + s.duration_minutes <= closeMinutes && slots.length < 24;
        minute += 15
      ) {
        const start = new Date(d);
        start.setUTCHours(Math.floor(minute / 60), minute % 60, 0, 0);
        for (const p of staff)
          if (await slotAvailable(db, s, p, start))
            slots.push({
              starts_at: start.toISOString(),
              ends_at: new Date(
                +start + s.duration_minutes * 60000,
              ).toISOString(),
              staff: p.id,
              staff_name: p.name,
              service: s.id,
            });
      }
    }
    return { slots, timezone: "UTC", service: s.name };
  }
  if (name === "lookup_customer") {
    const customer = (
      await db.query<{
        id: string;
        name: string;
        phone: string;
        notes: string;
      }>(
        "SELECT * FROM concierge_customers WHERE ($1::text IS NOT NULL AND phone=$1) OR ($2::text IS NOT NULL AND lower(name)=lower($2)) LIMIT 1",
        [a.phone || null, a.name || null],
      )
    ).rows[0];
    if (!customer) return { customer: null, appointments: [] };
    const appointments = (
      await db.query(
        "SELECT a.*, s.name AS service_name FROM concierge_appointments a JOIN concierge_services s ON s.id=a.service_id WHERE customer_id=$1 AND status='booked' AND starts_at>now() ORDER BY starts_at",
        [customer.id],
      )
    ).rows;
    return { customer, appointments };
  }
  if (name === "answer_from_knowledge_base") {
    const embedding = await embed(String(a.query));
    const lang = /[\u0600-\u06ff]/.test(String(a.query)) ? "ar" : "en";
    const chunks = (
      await db.query<{ id: string; content: string; distance: number }>(
        "SELECT id,content,embedding <=> $1::vector AS distance FROM concierge_kb_chunks WHERE lang=$2 ORDER BY embedding <=> $1::vector LIMIT 3",
        [JSON.stringify(embedding), lang],
      )
    ).rows;
    return { chunks, source: "Studio knowledge base", data_only: true };
  }
  if (name === "create_handoff") {
    const id = randomUUID();
    await db.query(
      "INSERT INTO concierge_handoffs (id,conversation_id,reason,summary,priority) VALUES ($1,$2,$3,$4,$5)",
      [id, ctx.conversationId, a.reason, a.summary, a.priority],
    );
    return { id, status: "open", ...a };
  }
  if (!ctx.customerId)
    return {
      error: "Please provide your phone number before changing an appointment",
    };
  if (name === "book_appointment") {
    const s = await serviceFor(db, String(a.service));
    const staff = (await staffFor(db, String(a.staff)))[0];
    const start = new Date(String(a.starts_at));
    if (!s || !staff || !(await slotAvailable(db, s, staff, start)))
      return {
        error: "This slot is no longer available. Please choose another time.",
      };
    const id = randomUUID();
    await db.query(
      "INSERT INTO concierge_appointments (id,customer_id,service_id,staff_id,starts_at,ends_at,source) VALUES ($1,$2,$3,$4,$5,$6,'agent')",
      [
        id,
        ctx.customerId,
        s.id,
        staff.id,
        start.toISOString(),
        new Date(+start + s.duration_minutes * 60000).toISOString(),
      ],
    );
    return {
      id,
      status: "booked",
      starts_at: start.toISOString(),
      service: s.name,
      staff: staff.name,
    };
  }
  const appointment = (
    await db.query<Appointment>(
      "SELECT * FROM concierge_appointments WHERE id=$1 AND customer_id=$2 AND status='booked'",
      [a.appointment_id, ctx.customerId],
    )
  ).rows[0];
  if (!appointment)
    return { error: "No matching active appointment for this customer" };
  if (name === "cancel_appointment") {
    await db.query(
      "UPDATE concierge_appointments SET status='cancelled' WHERE id=$1",
      [appointment.id],
    );
    await db.query(
      "UPDATE concierge_reminders SET status='cancelled' WHERE appointment_id=$1",
      [appointment.id],
    );
    return { id: appointment.id, status: "cancelled" };
  }
  if (name === "reschedule_appointment") {
    const s = (await serviceFor(db, appointment.service_id))!;
    const staff = (
      await staffFor(db, String(a.staff || appointment.staff_id))
    )[0];
    const start = new Date(String(a.starts_at));
    if (!staff || !(await slotAvailable(db, s, staff, start, appointment.id)))
      return {
        error: "This slot is no longer available. Please choose another time.",
      };
    await db.query(
      "UPDATE concierge_appointments SET starts_at=$2,ends_at=$3,staff_id=$4,source='agent' WHERE id=$1",
      [
        appointment.id,
        start.toISOString(),
        new Date(+start + s.duration_minutes * 60000).toISOString(),
        staff.id,
      ],
    );
    await db.query(
      "UPDATE concierge_reminders SET remind_at=$2 WHERE appointment_id=$1 AND status='scheduled'",
      [
        appointment.id,
        new Date(Math.max(Date.now() + 60000, +start - 86400000)).toISOString(),
      ],
    );
    return {
      id: appointment.id,
      status: "rescheduled",
      starts_at: start.toISOString(),
      service: s.name,
    };
  }
  if (name === "create_reminder") {
    const date = a.remind_at
      ? new Date(String(a.remind_at))
      : new Date(
          Math.max(
            Date.now() + 60000,
            +new Date(appointment.starts_at) - 86400000,
          ),
        );
    if (+date <= Date.now() || +date >= +new Date(appointment.starts_at))
      return {
        error: "Reminder must be in the future and before the appointment",
      };
    const id = randomUUID();
    await db.query(
      "INSERT INTO concierge_reminders (id,appointment_id,customer_id,remind_at) VALUES ($1,$2,$3,$4)",
      [id, appointment.id, ctx.customerId, date.toISOString()],
    );
    return {
      id,
      appointment_id: appointment.id,
      remind_at: date.toISOString(),
      status: "scheduled",
      delivery: "Demo record only; no SMS sent",
    };
  }
  return { error: "Unknown tool" };
}
