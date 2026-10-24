"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  CornerDownRight,
  Flower2,
  Globe2,
  Inbox,
  LayoutDashboard,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import type { Trace } from "@/lib/agent/types";
type Appointment = {
  id: string;
  starts_at: string;
  ends_at: string;
  customer_name: string;
  service_name: string;
  staff_name: string;
  service_id: string;
  source: string;
};
type Conversation = {
  id: string;
  customer_name: string;
  phone: string;
  preview: string;
  lang: string;
  updated_at: string;
  pending_action: unknown;
};
type Message = { id: string; role: string; content: string; turn: number };
type Handoff = {
  id: string;
  conversation_id: string;
  reason: string;
  summary: string;
  priority: string;
  status: string;
  customer_name: string;
  phone: string;
};
type Analytics = {
  agent_bookings: number;
  conversations: number;
  handoff_rate: number;
  avg_tool_steps: number;
  guardrail_blocks: number;
  languages: { lang: string; count: number }[];
  mode: string;
};
function monday(date: Date) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
const dayString = (d: Date) => d.toISOString().slice(0, 10);
const dayPlus = (d: Date, n: number) => new Date(+d + n * 86400000);
const localDay = (d: string, tz: string) =>
  new Date(d).toLocaleDateString("en-CA", { timeZone: tz });
const localMinutes = (d: string, tz: string) => {
  const [h, m] = new Date(d)
    .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz })
    .split(":");
  return Number(h) * 60 + Number(m);
};
async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok)
    throw new Error("Could not load studio data. Please try again.");
  return response.json();
}
export default function Dashboard() {
  const [week, setWeek] = useState(() => monday(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tz, setTz] = useState("UTC");
  const time = (d: string) =>
    new Date(d).toLocaleTimeString("en", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [trace, setTrace] = useState<Trace[]>([]);
  const [handoffs, setHandoffs] = useState<Handoff[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState("");
  const [active, setActive] = useState("overview");
  const [resolving, setResolving] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [a, c, h, s] = await Promise.all([
          fetchJson<{ appointments: Appointment[]; timezone?: string }>(
            `/api/dashboard/appointments?from=${dayString(week)}&to=${dayString(dayPlus(week, 7))}`,
            signal,
          ),
          fetchJson<{ conversations: Conversation[] }>(
            "/api/dashboard/conversations",
            signal,
          ),
          fetchJson<{ handoffs: Handoff[] }>("/api/dashboard/handoffs", signal),
          fetchJson<Analytics>("/api/dashboard/analytics", signal),
        ]);
        if (signal?.aborted) return;
        setAppointments(a.appointments);
        if (a.timezone) setTz(a.timezone);
        setConversations(c.conversations);
        setHandoffs(h.handoffs);
        setAnalytics(s);
        setSelected((old) => old || c.conversations[0]?.id || "");
        setError("");
        setLastSync(
          new Date().toLocaleTimeString("en", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "Unable to load data");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [week],
  );
  useEffect(() => {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    const controller = new AbortController();
    void load(controller.signal);
    const interval = setInterval(() => void load(controller.signal), 3000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [load]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setMessages([]);
    setTrace([]);
    setDetailLoading(true);
    const detail = async () => {
      try {
        const d = await fetchJson<{ messages: Message[]; trace: Trace[] }>(
          `/api/dashboard/conversations/${selected}`,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          setMessages(d.messages);
          setTrace(d.trace);
          setDetailLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setError("Could not load the selected conversation.");
          setDetailLoading(false);
        }
      }
    };
    void detail();
    const interval = setInterval(() => void detail(), 3000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [selected]);
  const resolve = async (id: string) => {
    setResolving(id);
    try {
      const r = await fetch("/api/dashboard/handoffs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "resolved" }),
      });
      if (!r.ok) throw new Error();
      await load();
    } catch {
      setError("Could not resolve this handoff. Please try again.");
    } finally {
      setResolving("");
    }
  };
  const jump = (id: string) => {
    setActive(id);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const chosen = conversations.find((c) => c.id === selected);
  const turns = [...new Set(trace.map((t) => t.turn))];
  const openHandoffs = handoffs.filter((h) => h.status === "open");
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Link className="qudra-mark" href="/">
          <span>
            <Flower2 size={25} />
          </span>
          qudra<small>CONCIERGE</small>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card">
          <span>N</span>
          <div>
            Noor Studio<small>Dental & Beauty</small>
          </div>
          <Check size={14} />
        </div>
        <nav>
          {[
            { id: "overview", label: "Overview", icon: LayoutDashboard },
            { id: "calendar", label: "Appointments", icon: CalendarDays },
            {
              id: "conversations",
              label: "Conversations",
              icon: MessageSquare,
            },
            { id: "handoffs", label: "Handoff inbox", icon: Inbox },
          ].map((item) => (
            <button
              key={item.id}
              className={active === item.id ? "active" : ""}
              onClick={() => jump(item.id)}
            >
              <item.icon size={18} />
              {item.label}
              {item.id === "handoffs" && openHandoffs.length > 0 && (
                <b>{openHandoffs.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-label">
            <span className="online-dot" />
            Demo workspace<small>Real actions. Fictional business.</small>
          </div>
          <Link href="/">
            Visit the studio
            <ArrowUpRight size={16} />
          </Link>
          <div className="staff-profile">
            <span>NS</span>
            <div>
              Studio team<small>Staff console</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="dashboard-main">
        <header className="dash-header">
          <div>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>Noor Studio</b>
          </div>
          <div>
            <span className="live-pill">
              <span className="online-dot" />
              Live · 3s refresh
            </span>
            <Link href="/">
              Open concierge
              <ArrowUpRight size={14} />
            </Link>
          </div>
        </header>
        <main className="dash-content" id="overview">
          <div className="dash-title">
            <div>
              <div className="eyebrow">A LITTLE MORE CLARITY</div>
              <h1>
                Your studio, in view<span>.</span>
              </h1>
              <p>Appointments, conversations, and every step in between.</p>
            </div>
            <button className="outline-button" onClick={() => void load()}>
              <RefreshCw size={15} className={loading ? "spin" : ""} />
              Refresh data
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className="metrics-grid">
            {[
              {
                title: "Agent appointments",
                value: analytics?.agent_bookings,
                sub: "Active bookings handled by the agent",
                icon: CalendarDays,
              },
              {
                title: "Handoff rate",
                value: analytics
                  ? `${Math.round(analytics.handoff_rate * 100)}%`
                  : undefined,
                sub: "Conversations passed to your team",
                icon: CornerDownRight,
              },
              {
                title: "Tool steps / turn",
                value: analytics?.avg_tool_steps.toFixed(1),
                sub: "Average across all customer turns",
                icon: Activity,
              },
              {
                title: "Guardrail blocks",
                value: analytics?.guardrail_blocks,
                sub: "Unsafe requests safely stopped",
                icon: ShieldCheck,
              },
            ].map((m) => (
              <article className="metric-card" key={m.title}>
                <div>
                  {m.title}
                  <m.icon size={17} />
                </div>
                <strong>{m.value ?? "—"}</strong>
                <p>{m.sub}</p>
              </article>
            ))}
          </div>
          <section className="panel calendar-panel" id="calendar">
            <div className="panel-heading">
              <div>
                <h2>
                  <CalendarDays size={18} />
                  The week ahead
                </h2>
                <p>
                  {appointments.length} appointments · All times in {tz}
                </p>
              </div>
              <div className="calendar-controls">
                <button
                  aria-label="Previous week"
                  onClick={() => setWeek(dayPlus(week, -7))}
                >
                  <ChevronLeft size={17} />
                </button>
                <b>
                  {week.toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}{" "}
                  –{" "}
                  {dayPlus(week, 6).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                    timeZone: "UTC",
                  })}
                </b>
                <button
                  aria-label="Next week"
                  onClick={() => setWeek(dayPlus(week, 7))}
                >
                  <ChevronRight size={17} />
                </button>
                <button
                  className="today-button"
                  onClick={() => setWeek(monday(new Date()))}
                >
                  Today
                </button>
              </div>
            </div>
            <div className="calendar-scroll">
              <div className="week-calendar">
                <div className="time-column">
                  <div className="day-header">{tz}</div>
                  <div className="time-grid">
                    {Array.from({ length: 12 }, (_, i) => (
                      <span key={i} style={{ top: i * 48 }}>
                        {String(9 + i).padStart(2, "0")}:00
                      </span>
                    ))}
                  </div>
                </div>
                {Array.from({ length: 7 }, (_, i) => {
                  const d = dayPlus(week, i);
                  const today = dayString(d) === dayString(new Date());
                  return (
                    <div
                      className={`calendar-day ${d.getUTCDay() === 5 ? "closed-day" : ""}`}
                      key={i}
                    >
                      <div className={`day-header ${today ? "is-today" : ""}`}>
                        <span>
                          {d.toLocaleDateString("en", {
                            weekday: "short",
                            timeZone: "UTC",
                          })}
                        </span>
                        <strong>{d.getUTCDate()}</strong>
                        {d.getUTCDay() === 5 && <small>Closed</small>}
                      </div>
                      <div className="day-slots">
                        {Array.from({ length: 11 }, (_, j) => (
                          <div className="hour-line" key={j} />
                        ))}
                        {appointments
                          .filter(
                            (a) => localDay(a.starts_at, tz) === dayString(d),
                          )
                          .map((a) => {
                            const start = new Date(a.starts_at);
                            const top =
                              (localMinutes(a.starts_at, tz) - 9 * 60) *
                              0.8;
                            const duration =
                              (+new Date(a.ends_at) - +start) / 60000;
                            return (
                              <div
                                tabIndex={0}
                                className={`calendar-event ${a.service_id === "facial" ? "beauty-event" : ""} ${a.staff_name.includes("Omar") ? "omar-event" : ""}`}
                                style={{
                                  top,
                                  height: Math.max(duration * 0.8, 34),
                                  width: a.staff_name.includes("Omar")
                                    ? "64%"
                                    : "94%",
                                  insetInlineStart: a.staff_name.includes(
                                    "Omar",
                                  )
                                    ? "33%"
                                    : "3%",
                                }}
                                key={a.id}
                                title={`${a.customer_name} · ${a.service_name} · ${a.staff_name} · ${time(a.starts_at)}–${time(a.ends_at)} ${tz}`}
                              >
                                <b>
                                  {time(a.starts_at)} · {a.customer_name}
                                </b>
                                <span>{a.service_name}</span>
                                {duration >= 60 && (
                                  <small>{a.staff_name}</small>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="calendar-footer">
              <span>
                <i />
                Dental care
              </span>
              <span>
                <i className="beauty-dot" />
                Beauty care
              </span>
              <span className="sync-time">
                {loading ? "Loading studio data…" : `Synced ${lastSync}`}
              </span>
            </div>
          </section>
          <div className="conversation-workbench" id="conversations">
            <section className="panel conversation-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <MessageSquare size={18} />
                    Conversations
                  </h2>
                  <p>{conversations.length} recent conversations</p>
                </div>
                <span className="count-badge">{conversations.length}</span>
              </div>
              <div className="conversation-list">
                {conversations.length === 0 ? (
                  <div className="empty-state">
                    <MessageSquare size={28} />
                    <b>The first hello starts here.</b>
                    <p>
                      Chat with the studio concierge to see its memory and
                      decisions.
                    </p>
                    <Link href="/">
                      Try the concierge
                      <ArrowUpRight size={14} />
                    </Link>
                  </div>
                ) : (
                  conversations.map((c) => (
                    <button
                      className={c.id === selected ? "selected" : ""}
                      key={c.id}
                      onClick={() => setSelected(c.id)}
                    >
                      <span className="customer-avatar">
                        {(c.customer_name || "Guest").slice(0, 1)}
                      </span>
                      <div>
                        <b>
                          {c.customer_name || "Visitor"}
                          <small>{c.lang.toUpperCase()}</small>
                        </b>
                        <p dir="auto">{c.preview || "New conversation"}</p>
                        <span>
                          {c.phone || "No phone shared"}
                          {Boolean(c.pending_action) &&
                            " · Awaiting confirmation"}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
              <div className="transcript-heading">
                <b>{chosen?.customer_name || "Conversation transcript"}</b>
                {chosen && (
                  <span>
                    <Globe2 size={12} />
                    {chosen.lang === "ar" ? "Arabic" : "English"}
                  </span>
                )}
              </div>
              <div className="transcript">
                {detailLoading ? (
                  <div className="empty-state">
                    <LoaderCircle size={22} className="spin" />
                    <p>Loading conversation…</p>
                  </div>
                ) : messages.length === 0 ? (
                  <p className="transcript-empty">
                    Select a conversation to read the exchange.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`transcript-message ${m.role}`}>
                      <span>
                        {m.role === "user" ? "CUSTOMER" : "NOOR CONCIERGE"}
                        <small>TURN {m.turn}</small>
                      </span>
                      <p dir="auto">{m.content}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
            <section className="trace-panel panel">
              <div className="trace-heading">
                <div>
                  <span className="trace-icon">
                    <Terminal size={20} />
                  </span>
                  <div>
                    <h2>Behind the conversation</h2>
                    <p>Every decision. Every tool. In the open.</p>
                  </div>
                </div>
                <span className="trace-live">
                  <span className="online-dot" />
                  AGENT TRACE
                </span>
              </div>
              <div className="trace-summary">
                <span>
                  <Code2 size={13} />
                  {trace.filter((t) => t.kind === "tool").length} tool calls
                </span>
                <span>
                  <Clock3 size={13} />
                  {trace.reduce((n, t) => n + t.latency_ms, 0)} ms
                </span>
                <span>
                  {analytics?.mode === "gemini"
                    ? "Gemini 2.5 Flash"
                    : "Deterministic mock"}
                </span>
              </div>
              <div className="trace-body">
                {trace.length === 0 ? (
                  <div className="trace-empty">
                    <div>
                      <Sparkles size={30} strokeWidth={1} />
                    </div>
                    <h3>A clear view of the thinking.</h3>
                    <p>
                      Tool calls, confirmation gates, and guardrails will appear
                      here as the conversation unfolds.
                    </p>
                    <span>USER → PLAN → TOOLS → CONFIRM → ACT</span>
                  </div>
                ) : (
                  turns.map((turn) => (
                    <div className="trace-turn" key={turn}>
                      <div className="turn-divider">
                        <span>TURN {String(turn).padStart(2, "0")}</span>
                        <i />
                        <small>
                          {trace.filter((t) => t.turn === turn).length} events
                        </small>
                      </div>
                      {trace
                        .filter((t) => t.turn === turn)
                        .map((t) => (
                          <article
                            key={t.id}
                            className={`trace-event ${t.kind}`}
                          >
                            <div className="step-marker">
                              {t.kind === "guardrail" ? (
                                <ShieldCheck size={14} />
                              ) : t.kind === "confirm" ? (
                                <CheckCheck size={14} />
                              ) : (
                                t.step
                              )}
                            </div>
                            <div className="trace-event-content">
                              <div className="trace-event-title">
                                <b>{t.tool}</b>
                                <span className={`trace-badge ${t.kind}`}>
                                  {t.kind === "guardrail"
                                    ? "GUARDRAIL"
                                    : t.kind === "confirm"
                                      ? "CONFIRM"
                                      : "TOOL"}
                                </span>
                              </div>
                              <div className="trace-meta">
                                <span>STEP {t.step}</span>
                                <span>{t.latency_ms} ms</span>
                                <span
                                  className={
                                    t.result.error || t.result.blocked
                                      ? "trace-warning"
                                      : ""
                                  }
                                >
                                  {String(
                                    t.result.status ||
                                      (t.result.blocked
                                        ? "blocked"
                                        : t.result.error
                                          ? "error"
                                          : "completed"),
                                  )}
                                </span>
                              </div>
                              <details open={t.kind !== "tool"}>
                                <summary>
                                  Inspect input & output
                                  <Code2 size={12} />
                                </summary>
                                <div className="trace-json">
                                  <label>ARGUMENTS</label>
                                  <pre>{JSON.stringify(t.args, null, 2)}</pre>
                                  <label>
                                    RESULT <span>data</span>
                                  </label>
                                  <pre>{JSON.stringify(t.result, null, 2)}</pre>
                                </div>
                              </details>
                            </div>
                          </article>
                        ))}
                    </div>
                  ))
                )}
              </div>
              <div className="trace-footer">
                <ShieldCheck size={13} />
                Writes wait for an explicit confirmation.
              </div>
            </section>
          </div>
          <div className="bottom-grid">
            <section className="panel handoff-panel" id="handoffs">
              <div className="panel-heading">
                <div>
                  <h2>
                    <Inbox size={18} />A human touch
                  </h2>
                  <p>Requests that need your team’s attention.</p>
                </div>
                <span className="count-badge">{openHandoffs.length} open</span>
              </div>
              {handoffs.length === 0 ? (
                <div className="handoff-empty">
                  <CheckCheck size={23} />
                  <div>
                    <b>All clear, for now.</b>
                    <p>
                      Staff requests will land here with conversation context.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="handoff-list">
                  {handoffs.map((h) => (
                    <article key={h.id}>
                      <div className="handoff-title">
                        <b>{h.customer_name || "Visitor"}</b>
                        <span className={`handoff-status ${h.status}`}>
                          {h.status === "resolved"
                            ? "Resolved"
                            : h.priority === "urgent"
                              ? "Urgent"
                              : "Needs attention"}
                        </span>
                      </div>
                      <p dir="auto">{h.summary}</p>
                      <small>
                        {h.phone || "No phone shared"} · {h.reason}
                      </small>
                      <div>
                        <button
                          className="text-link"
                          onClick={() => {
                            setSelected(h.conversation_id);
                            jump("conversations");
                          }}
                        >
                          View conversation
                          <ArrowUpRight size={13} />
                        </button>
                        {h.status === "open" && (
                          <button
                            className="resolve-button"
                            disabled={resolving === h.id}
                            onClick={() => void resolve(h.id)}
                          >
                            {resolving === h.id ? (
                              <LoaderCircle size={13} className="spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            Resolve
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="panel language-panel">
              <div className="panel-heading">
                <div>
                  <h2>
                    <Globe2 size={18} />
                    Care in their language
                  </h2>
                  <p>Language of the latest turn per conversation.</p>
                </div>
              </div>
              <div className="language-stats">
                {["en", "ar"].map((lang) => {
                  const count =
                    analytics?.languages.find((l) => l.lang === lang)?.count ||
                    0;
                  const total = analytics?.conversations || 0;
                  return (
                    <div key={lang}>
                      <div>
                        <span>{lang === "en" ? "English" : "العربية"}</span>
                        <b>
                          {count} <small>conversations</small>
                        </b>
                      </div>
                      <div className="language-bar">
                        <span
                          style={{
                            width: total ? `${(count / total) * 100}%` : "0%",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                <div className="language-note">
                  <Sparkles size={16} />
                  One front desk. Two languages. A personal welcome.
                </div>
              </div>
            </section>
          </div>
          <footer className="dash-footer">
            <span>Qudra Concierge · Noor Studio demo</span>
            <span>Postgres (hosted via DATABASE_URL, or local PGlite)</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
