# Qudra Concierge

**An agentic AI front desk for appointment-based businesses such as clinics and salons.** It books, reschedules and cancels real appointments, answers from the business's own knowledge base, and hands off to staff. It works in English and Arabic (including dialects) and shows every decision it makes in a live trace.

It is not a chatbot wrapper. The model plans with **Gemini function calling** against a real Postgres database. The application, not the model, enforces the rules: **no write happens without the customer's explicit confirmation**.

![Demo site with the embedded concierge asking for confirmation](docs/screenshots/02-widget-confirm.png)

## The problem
Small clinics and salons lose bookings outside working hours and spend staff time on the same questions. Generic chat widgets either can't *do* anything or are trusted to write to the calendar unchecked. Owners can't see why the bot did what it did.

## What makes it different
- **Real tools, real data.** Availability is computed from opening hours plus existing appointments. Conflicts produce real alternatives.
- **Confirmation-gated writes.** Book, reschedule, cancel and reminder calls become a *pending action*. They run only after "yes", "نعم" or "اكيد", or a click on Confirm. Multi-step plans ("move my Thursday cleaning to next week after 5pm and remind me") are bundled into one confirmation.
- **Agent trace panel.** Staff see every step: the tool, its arguments, its result, latency, plus guardrail and confirmation events.
- **Guardrails in code.** Prompt-injection detection (English and Arabic), refusal to give medical advice with a redirect to booking or staff, and tool output treated as untrusted data.
- **Bilingual and RTL.** Arabic replies, Gulf, Levantine and Egyptian dialect intents, and a full RTL site and widget.
- **One `<script>` tag** embeds the widget (shadow DOM, no CSS clashes) on any site.
- **Runs anywhere.** Without `GEMINI_API_KEY`, a deterministic mock planner drives the same tools, so the demo, tests and evals work offline.

## Architecture
```mermaid
flowchart LR
  W["Widget<br/>public/widget.js<br/>(one script tag)"] -->|POST /api/chat| API[Next.js route]
  API --> G{Guardrails<br/>injection / medical}
  G -->|blocked| T[(trace)]
  G --> L[Agent loop<br/>max 6 steps]
  L <-->|function calling| LLM["Gemini<br/>(or mock planner)"]
  L --> R[Read tools<br/>check_availability<br/>lookup_customer<br/>answer_from_knowledge_base]
  L --> P[Write tools → pending_action]
  P -->|user confirms| X[Execute writes]
  R & X --> DB[(Postgres via PGlite<br/>+ pgvector)]
  L --> T
  D[Staff dashboard] -->|/api/dashboard/*| DB
```

### Agent loop
1. Load memory: the last messages and the customer profile (looked up by phone).
2. Run the guardrail pre-check. Injection and medical-advice requests are answered safely and logged as `guardrail` trace rows.
3. The model plans one or more function calls. Each call is validated with **zod** and run with its latency recorded, then the result is fed back as an untrusted data envelope. Gemini model turns are replayed verbatim so thought signatures are kept.
4. If the plan contains write tools, they are **not executed**. They are stored as `pending_action` and the agent asks for confirmation.
5. On confirmation the stored action runs in a transaction and the result is logged.

### Tools
| Tool | Kind | What it does |
| --- | --- | --- |
| `check_availability` | read | Free slots for a service and date range, with an optional "after 17:00" and staff filter |
| `lookup_customer` | read | Finds a customer by phone or name, with upcoming appointments |
| `answer_from_knowledge_base` | read | pgvector cosine top-k over the business FAQ and services (EN and AR) |
| `create_handoff` | escalation | Opens a ticket in the staff handoff inbox with a summary and priority |
| `book_appointment` | write (confirm) | Books after re-checking for conflicts |
| `reschedule_appointment` | write (confirm) | Moves an appointment |
| `cancel_appointment` | write (confirm) | Cancels an appointment |
| `create_reminder` | write (confirm) | Stores a reminder (demo only, no SMS is sent) |

## Staff dashboard
A live week calendar (refreshed every 3s), conversations and transcripts, the **agent trace**, a handoff inbox with resolve, and analytics computed from the database: agent bookings, handoff rate, tool steps per turn, languages and guardrail blocks.

![Dashboard](docs/screenshots/04-dashboard.png)

| Site | Guardrails |
| --- | --- |
| ![](docs/screenshots/01-site.png) | ![](docs/screenshots/03-widget-guardrails.png) |

## Evals
`npm run evals` runs 11 scripted scenarios, each against a fresh in-memory database. Each one checks tool calls, the database state *and* the reply: booking with confirmation, conflict leading to an alternative, multi-step reschedule plus reminder, cancel, a knowledge-base question, Gulf Arabic booking, an Egyptian Arabic question, a prompt-injection attempt, a medical-advice request, a handoff, and a write without confirmation that must not change anything.

Latest mock run: **11/11 passed** ([evals/results.md](evals/results.md)). `npm run evals:live` runs the same scenarios against Gemini. The first live run passed the injection, medical and handoff scenarios before the free-tier quota ran out, so a full live run is still to do.

Unit tests: `npm test` runs 55 Vitest tests covering availability and conflicts, guardrails and planner parsing.

## Run it
```bash
npm install
npm run dev            # http://localhost:3000 (site + widget), /dashboard
# optional live AI
echo "GEMINI_API_KEY=your_key" > .env.local   # optional: GEMINI_MODEL=gemini-3.8-flash
npm test && npm run evals
```
Data is stored with embedded Postgres ([PGlite](https://github.com/electric-sql/pglite) + pgvector) in `.data/`, so no database server is needed. All tables use the `concierge_` prefix and can be moved to Supabase or Postgres as they are.

## Embed on any site
```html
<script src="https://your-host/widget.js" data-business="noor" defer></script>
```

## Stack
Next.js 15 (App Router), TypeScript, Tailwind v4, `@google/genai` (Gemini function calling, `gemini-embedding-001` embeddings), PGlite with pgvector, zod, Vitest, Playwright for screenshots, and lucide-react icons.

## Credits
Bootstrapped from [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) (MIT). "Noor Dental & Beauty Studio" is a fictional business, and all of its data is demo seed data.

Built by [Maeen Alganimi](https://github.com/MaeenAlganimi) · Qudra Labs · MIT License
