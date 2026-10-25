"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, RefreshCw } from "lucide-react";

type Block = { key: string; staff: string; staffName: string; date: string; start: string; end: string };
type Data = { timezone: string; blocks: Block[] };

const OPEN = 9 * 60, CLOSE = 20 * 60;
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const pct = (t: string) => ((Math.min(Math.max(mins(t), OPEN), CLOSE) - OPEN) / (CLOSE - OPEN)) * 100;
const lane = (s: string) => Math.max(0, ["sara", "omar", "lina"].indexOf(s));
const tone: Record<string, string> = { sara: "var(--cal-sage, #6f9a85)", omar: "var(--cal-sand, #c39a6b)", lina: "var(--cal-rose, #c98f8f)" };

function days(n: number, tz: string) {
  const out: string[] = [];
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  for (let i = 0; i < n; i++) out.push(fmt.format(new Date(Date.now() + i * 86400000)));
  return out;
}

export default function LiveCalendar({ ar }: { ar: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [pulse, setPulse] = useState(0);
  const prev = useRef<Map<string, string>>(new Map());

  const load = useCallback(async (animate: boolean) => {
    const res = await fetch("/api/availability", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json()) as Data;
    const next = new Map(d.blocks.map((b) => [b.key, `${b.date} ${b.start} ${b.staff}`]));
    if (animate) {
      setFresh(new Set(d.blocks.filter((b) => prev.current.get(b.key) !== next.get(b.key)).map((b) => b.key)));
      setPulse((p) => p + 1);
    }
    prev.current = next;
    setData(d);
  }, []);

  useEffect(() => {
    load(false);
    const changed = () => load(true);
    window.addEventListener("noor:changed", changed);
    const t = setInterval(() => load(true), 30000);
    return () => { window.removeEventListener("noor:changed", changed); clearInterval(t); };
  }, [load]);

  const tz = data?.timezone || "UTC";
  const list = days(6, tz).filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 5).slice(0, 5);
  const label = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(ar ? "ar" : "en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" });

  return (
    <motion.section className="section live-calendar" id="availability" initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
      <div className="eyebrow">{ar ? "مباشر / المواعيد" : "LIVE / THE WEEK AHEAD"}</div>
      <div className="section-heading">
        <h2>{ar ? "شاهد المساعد يعمل." : "Watch the concierge work."}</h2>
        <p>{ar ? "احجز أو غيّر موعداً في المحادثة، وسيتحرك الجدول فوراً. الأسماء مخفية." : "Book, move or cancel in the chat and this calendar updates the moment you confirm. Names are never shown."}</p>
      </div>
      <div className="cal-legend">
        {[["sara", "Dr. Sara"], ["omar", "Dr. Omar"], ["lina", "Lina"]].map(([k, n]) => (
          <span key={k}><i style={{ background: tone[k] }} />{n}</span>
        ))}
        <motion.span key={pulse} className="cal-sync" initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
          <RefreshCw size={13} /> {ar ? "متزامن" : "Live"} · {tz}
        </motion.span>
      </div>
      <div className="cal-grid" role="table" aria-label={ar ? "الجدول الأسبوعي" : "Weekly availability"}>
        <div className="cal-hours" aria-hidden>
          {[9, 12, 15, 18].map((h) => <span key={h} style={{ top: `${((h * 60 - OPEN) / (CLOSE - OPEN)) * 100}%` }}>{String(h).padStart(2, "0")}:00</span>)}
        </div>
        {list.map((d, di) => (
          <motion.div role="row" key={d} className="cal-day" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: di * 0.07, duration: 0.5 }}>
            <div className="cal-day-label"><CalendarDays size={13} /> {label(d)}</div>
            <div className="cal-track">
              <AnimatePresence>
                {(data?.blocks ?? []).filter((b) => b.date === d).map((b) => (
                  <motion.div
                    layout
                    layoutId={b.key}
                    key={b.key}
                    role="cell"
                    className={`cal-block${fresh.has(b.key) ? " is-fresh" : ""}`}
                    style={{ top: `${pct(b.start)}%`, insetInlineStart: `calc(${lane(b.staff)} * 33.333% + 3px)`, width: "calc(33.333% - 6px)", height: `${Math.max(pct(b.end) - pct(b.start), 3)}%`, background: tone[b.staff] || "#7d8c7d" }}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.35 } }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    title={`${b.staffName} ${b.start}–${b.end}`}
                  >
                    <span>{b.start}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
