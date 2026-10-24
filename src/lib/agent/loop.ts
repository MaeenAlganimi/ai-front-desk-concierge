import { randomUUID } from "node:crypto";
import { getDb, type Database } from "../db";
import { getLLM, type LLM } from "./llm";
import { executeTool, toolSchemas, writeTools, type ToolName } from "./tools";
import {
  detectLanguage,
  isConfirmation,
  isMedicalAdvice,
  isPromptInjection,
  isRejection,
} from "./guardrails";
import type {
  Args,
  HistoryMessage,
  PendingAction,
  ToolCall,
  ToolResult,
  Trace,
} from "./types";

type Input = {
  conversationId?: string;
  message: string;
  customerPhone?: string;
  confirm?: boolean;
};
type Conversation = {
  id: string;
  customer_id: string | null;
  lang: "en" | "ar";
  pending_action: PendingAction | null;
};
export type AgentResponse = {
  reply: string;
  trace: Trace[];
  pendingAction?: PendingAction;
  conversationId: string;
  mode: "gemini" | "mock";
};
const queues = new WeakMap<Database, Promise<unknown>>();
// Serialise turns on one database, so duplicate confirmation clicks cannot execute a proposal twice.
export async function runAgent(
  input: Input,
  options: { db?: Database; llm?: LLM } = {},
): Promise<AgentResponse> {
  const db = options.db || (await getDb());
  const previous = queues.get(db) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(() => runTurn(db, input, options.llm || getLLM()));
  queues.set(db, task);
  try {
    return await task;
  } finally {
    if (queues.get(db) === task) queues.delete(db);
  }
}
async function runTurn(
  db: Database,
  input: Input,
  llm: LLM,
): Promise<AgentResponse> {
  const id = input.conversationId || randomUUID();
  let conversation = (
    await db.query<Conversation>(
      "SELECT * FROM concierge_conversations WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (input.conversationId && !conversation)
    throw new Error("Conversation not found");
  if (!conversation) {
    await db.query(
      "INSERT INTO concierge_conversations (id,lang) VALUES ($1,$2)",
      [id, detectLanguage(input.message)],
    );
    conversation = {
      id,
      customer_id: null,
      lang: detectLanguage(input.message),
      pending_action: null,
    };
  }
  const phoneMessage = /^\+?[\d\s()-]{7,24}$/.test(input.message.trim());
  let phone = (
    input.customerPhone ||
    (!conversation.customer_id && phoneMessage
      ? input.message.trim()
      : undefined)
  )?.replace(/[\s()-]/g, "");
  if (phone && !/^\+?\d{7,15}$/.test(phone))
    throw new Error("Please provide a valid phone number");
  if (
    phone &&
    !isPromptInjection(input.message) &&
    !isMedicalAdvice(input.message)
  ) {
    const old = conversation.customer_id
      ? (
          await db.query<{ phone: string }>(
            "SELECT phone FROM concierge_customers WHERE id=$1",
            [conversation.customer_id],
          )
        ).rows[0]
      : null;
    if (old && old.phone !== phone)
      throw new Error("This conversation belongs to a different phone number");
    await db.query(
      "INSERT INTO concierge_customers (id,name,phone) VALUES ($1,$2,$3) ON CONFLICT (phone) DO NOTHING",
      [randomUUID(), "Guest", phone],
    );
    conversation.customer_id = (
      await db.query<{ id: string }>(
        "SELECT id FROM concierge_customers WHERE phone=$1",
        [phone],
      )
    ).rows[0].id;
    await db.query(
      "UPDATE concierge_conversations SET customer_id=$2 WHERE id=$1",
      [id, conversation.customer_id],
    );
  } else if (conversation.customer_id)
    phone = (
      await db.query<{ phone: string }>(
        "SELECT phone FROM concierge_customers WHERE id=$1",
        [conversation.customer_id],
      )
    ).rows[0]?.phone;
  const confirming = input.confirm || isConfirmation(input.message);
  const lang =
    confirming || phoneMessage || isRejection(input.message)
      ? conversation.lang
      : detectLanguage(input.message);
  const text = (en: string, ar: string) => (lang === "ar" ? ar : en);
  const turn = Number(
    (
      await db.query<{ turn: number }>(
        "SELECT coalesce(max(turn),0)+1 AS turn FROM concierge_messages WHERE conversation_id=$1",
        [id],
      )
    ).rows[0].turn,
  );
  const history = (
    await db.query<HistoryMessage>(
      "SELECT role,content FROM (SELECT role,content,created_at,turn FROM concierge_messages WHERE conversation_id=$1 ORDER BY turn DESC,created_at DESC LIMIT 16) m ORDER BY turn,created_at",
      [id],
    )
  ).rows;
  const profile = conversation.customer_id
    ? (
        await db.query<{ name: string; notes: string }>(
          "SELECT name,notes FROM concierge_customers WHERE id=$1",
          [conversation.customer_id],
        )
      ).rows[0]
    : null;
  if (profile)
    history.unshift({
      role: "system",
      content: `Customer profile (data): ${JSON.stringify(profile)}`,
    });
  await db.query(
    "INSERT INTO concierge_messages (id,conversation_id,role,content,turn) VALUES ($1,$2,'user',$3,$4)",
    [randomUUID(), id, input.message, turn],
  );
  await db.query(
    "UPDATE concierge_conversations SET lang=$2,updated_at=now() WHERE id=$1",
    [id, lang],
  );
  const trace: Trace[] = [];
  const log = async (
    tool: string,
    args: Args,
    result: ToolResult,
    kind: Trace["kind"] = "tool",
    latency = 0,
  ) => {
    const row: Trace = {
      id: randomUUID(),
      conversation_id: id,
      turn,
      step: trace.length + 1,
      tool,
      args,
      result,
      latency_ms: Math.round(latency),
      kind,
    };
    await db.query(
      "INSERT INTO concierge_tool_calls (id,conversation_id,turn,step,tool,args,result,latency_ms,kind) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        row.id,
        id,
        turn,
        row.step,
        tool,
        JSON.stringify(args),
        JSON.stringify(result),
        row.latency_ms,
        kind,
      ],
    );
    trace.push(row);
  };
  const finish = async (
    reply: string,
    pendingAction?: PendingAction,
  ): Promise<AgentResponse> => {
    await db.query(
      "INSERT INTO concierge_messages (id,conversation_id,role,content,turn) VALUES ($1,$2,'assistant',$3,$4)",
      [randomUUID(), id, reply, turn],
    );
    return {
      reply,
      trace,
      ...(pendingAction ? { pendingAction } : {}),
      conversationId: id,
      mode: llm.mode,
    };
  };
  const clearPending = () =>
    db.query(
      "UPDATE concierge_conversations SET pending_action=NULL WHERE id=$1",
      [id],
    );
  if (isPromptInjection(input.message)) {
    await clearPending();
    await log(
      "prompt_injection",
      {},
      { blocked: true, reason: "Instruction override attempt" },
      "guardrail",
    );
    return finish(
      text(
        "I can’t follow requests to override my instructions or reveal internal prompts. I can help with studio appointments and information.",
        "لا أستطيع تجاوز التعليمات أو كشف التعليمات الداخلية. أقدر أساعدك بمواعيد ومعلومات الاستوديو.",
      ),
    );
  }
  if (isMedicalAdvice(input.message)) {
    await clearPending();
    await log(
      "medical_advice",
      {},
      {
        blocked: true,
        reason: "Clinical advice requires a qualified clinician",
      },
      "guardrail",
    );
    return finish(
      text(
        "I can’t diagnose conditions or recommend medication or dosage. A qualified clinician can help. Would you like to book a consultation or speak with our team?",
        "لا أستطيع تقديم تشخيص أو التوصية بدواء أو جرعة. الطبيب المؤهل يستطيع مساعدتك. هل ترغب بحجز استشارة أو التواصل مع الفريق؟",
      ),
    );
  }
  if (conversation.pending_action && isRejection(input.message)) {
    await clearPending();
    await log("confirmation", {}, { status: "declined" }, "confirm");
    return finish(
      text(
        "Proposal dismissed. Your appointments are unchanged. What else can I help with?",
        "تم إلغاء الاقتراح. لم تتغير مواعيدك. كيف أساعدك؟",
      ),
    );
  }
  if (confirming) {
    const pending = conversation.pending_action;
    if (!pending)
      return finish(
        text(
          "There is no pending change to confirm. What would you like to arrange?",
          "لا يوجد تغيير بانتظار التأكيد. كيف أساعدك؟",
        ),
      );
    const executed: { call: ToolCall; result: ToolResult; latency: number }[] =
      [];
    let failed = "";
    try {
      await db.transaction(async (tx) => {
        let lastAppointment = "";
        for (const call of pending.calls) {
          if (!writeTools.has(call.name))
            throw new Error("Invalid pending action");
          const args = { ...call.args };
          if (args.appointment_id === "$previous")
            args.appointment_id = lastAppointment;
          const start = performance.now();
          let result: ToolResult;
          try {
            result = await executeTool(call.name, args, {
              db: tx,
              conversationId: id,
              customerId: conversation.customer_id || undefined,
            });
          } catch {
            result = { error: "Tool execution failed. Please try again." };
          }
          executed.push({
            call: { name: call.name, args },
            result,
            latency: performance.now() - start,
          });
          if (result.error) throw new Error(String(result.error));
          if (call.name !== "create_reminder")
            lastAppointment = String(result.id || "");
        }
        await tx.query(
          "UPDATE concierge_conversations SET pending_action=NULL WHERE id=$1",
          [id],
        );
      });
    } catch (error) {
      failed =
        error instanceof Error ? error.message : "Unable to complete change";
      await clearPending();
    }
    await log(
      "confirmation",
      {},
      {
        status: failed ? "failed" : "accepted",
        ...(failed ? { error: failed } : {}),
      },
      "confirm",
    );
    for (const entry of executed)
      await log(
        entry.call.name,
        entry.call.args,
        failed ? { ...entry.result, rolled_back: true } : entry.result,
        "tool",
        entry.latency,
      );
    if (failed)
      return finish(
        text(
          `Your changes were not saved: ${failed} Please ask for a new available slot.`,
          `لم يتم حفظ التغييرات. قد يكون الموعد غير متاح. يرجى طلب موعد متاح جديد.`,
        ),
      );
    return finish(
      text(
        `Confirmed. ${pending.summary} ${pending.calls.some((c) => c.name === "create_reminder") ? "A demo reminder is scheduled; no SMS will be sent." : ""}`.trim(),
        `تم التأكيد. ${pending.summary} ${pending.calls.some((c) => c.name === "create_reminder") ? "تم حفظ تذكير تجريبي، ولن يتم إرسال رسالة نصية." : ""}`.trim(),
      ),
    );
  }
  if (conversation.pending_action) {
    await clearPending();
    await log("confirmation", {}, { status: "superseded" }, "confirm");
  }
  const results: { call: ToolCall; result: ToolResult }[] = [];
  let steps = 0;
  while (steps < 6) {
    let plan;
    try {
      plan = await llm.plan({
        message: input.message,
        lang,
        customerId: conversation.customer_id || undefined,
        customerPhone: phone,
        history,
        results,
        today: new Date().toISOString().slice(0, 10),
      });
    } catch {
      return finish(
        text(
          "The assistant is temporarily unavailable. Please try again, or ask our team for help.",
          "المساعد غير متاح مؤقتاً. يرجى المحاولة مجدداً أو طلب مساعدة الفريق.",
        ),
      );
    }
    if (!plan.calls?.length)
      return finish(plan.reply || text("How can I help?", "كيف أساعدك؟"));
    if (steps + plan.calls.length > 6) break;
    const writes = plan.calls.filter((call) => writeTools.has(call.name));
    for (const call of plan.calls.filter(
      (call) => !writeTools.has(call.name),
    )) {
      const start = performance.now();
      let result: ToolResult;
      try {
        result = await executeTool(call.name, call.args, {
          db,
          conversationId: id,
          customerId: conversation.customer_id || undefined,
        });
      } catch {
        result = {
          error:
            "Tool unavailable. Please try again or contact the studio team.",
        };
      }
      await log(
        call.name,
        call.args,
        result,
        "tool",
        performance.now() - start,
      );
      results.push({ call, result });
      steps++;
    }
    if (writes.length) {
      if (!conversation.customer_id)
        return finish(
          text(
            "Please share your phone number before I prepare this change.",
            "يرجى إدخال رقم هاتفك قبل تجهيز التغيير.",
          ),
        );
      const invalid = writes.find(
        (call) =>
          !toolSchemas[call.name as ToolName].safeParse(call.args).success,
      );
      if (invalid) {
        await log(
          invalid.name,
          invalid.args,
          { error: "Invalid proposal arguments" },
          "guardrail",
        );
        return finish(
          text(
            "I need a little more information to prepare that change. Please specify a service, date and time.",
            "أحتاج معلومات إضافية. يرجى تحديد الخدمة والتاريخ والوقت.",
          ),
        );
      }
      const summaries = writes.map((c) => {
        const time = c.args.starts_at
          ? String(c.args.starts_at).replace("T", " ").slice(0, 16) + " UTC"
          : "";
        const service = String(c.args.service || "");
        const serviceAr: Record<string, string> = {
          cleaning: "تنظيف الأسنان",
          consultation: "استشارة أسنان",
          whitening: "تبييض الأسنان",
          facial: "عناية بالبشرة",
        };
        if (c.name === "book_appointment")
          return text(
            `Book ${service} on ${time}.`,
            `حجز ${serviceAr[service] || service} في ${time}.`,
          );
        if (c.name === "reschedule_appointment")
          return text(
            `Move your appointment to ${time}.`,
            `نقل موعدك إلى ${time}.`,
          );
        if (c.name === "cancel_appointment")
          return text("Cancel your appointment.", "إلغاء موعدك.");
        return text("Schedule a reminder.", "حفظ تذكير.");
      });
      const pending: PendingAction = {
        calls: writes,
        summary: summaries.join(" "),
      };
      await db.query(
        "UPDATE concierge_conversations SET pending_action=$2 WHERE id=$1",
        [id, JSON.stringify(pending)],
      );
      for (const call of writes)
        await log(
          call.name,
          call.args,
          { status: "proposed", executed: false },
          "confirm",
        );
      const availability = results.find(
        (r) => r.call.name === "check_availability",
      );
      const requestedTime = availability?.call.args.after_time;
      const isAlternative =
        requestedTime &&
        writes[0]?.args.starts_at &&
        String(writes[0].args.starts_at).slice(11, 16) !== requestedTime;
      return finish(
        text(
          `${isAlternative ? "That requested time is unavailable; here is an alternative. " : ""}${pending.summary} Shall I confirm? Nothing changes until you confirm.`,
          `${isAlternative ? "الوقت المطلوب غير متاح، إليك موعداً بديلاً. " : ""}${pending.summary} هل تؤكد؟ لن يتم أي تغيير قبل تأكيدك.`,
        ),
        pending,
      );
    }
  }
  await log("step_limit", {}, { blocked: true, limit: 6 }, "guardrail");
  return finish(
    text(
      "I need our team’s help to complete this request. Would you like a staff handoff?",
      "أحتاج مساعدة الفريق لإتمام هذا الطلب. هل تريد التواصل مع موظف؟",
    ),
  );
}
