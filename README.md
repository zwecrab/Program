# PMP Trainer

Private, single-user PMP exam prep app. 2026 ECO + PMBOK Guide 8th Edition. Exam: **31 Oct 2026**.

This README is written for you in six months. Start at *Setup*, then *Building the bank*.

---

## Setup (fresh clone)

```bash
npm install
cp .env.example .env         # fill in the three required secrets below
npm run dev                  # http://localhost:3000
```

Required in `.env` (the app refuses to start without them and says which is missing):

| Key | What |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter key. Server-side only. Never in client code, never in the repo, never logged. |
| `APP_PASSPHRASE` | The one passphrase you type on the login screen. |
| `SESSION_SECRET` | ≥32 random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Optional: `OPENROUTER_MODEL` (default `deepseek/deepseek-v4-flash`; validated against OpenRouter at boot — a missing slug prints three cheap alternatives and exits), `DATABASE_URL` (default `file:./data/pmp.db`), `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (prod), `SOURCE_DIR` (folder holding the PMI PDFs), `MONTHLY_LLM_CAP_USD` (default 5), `ACTIVE_EXAM` (default `PMP`).

On first boot the app runs migrations and seeds: the PMP exam row, 26 ECO tasks (as `syllabus_items`, with an `eco_tasks` view), the 47-day roadmap (day 1 = 15 Sep 2026), the 16 Sep cold-baseline session (15 questions, 4 correct, 26.7%). Seeding is idempotent.

Phone on the same Wi-Fi: `npm run dev -- -H 0.0.0.0`, open `http://<laptop-ip>:3000`, "Add to Home Screen". Production builds ship a service worker: lessons, flashcards, plan and Today work offline; practice and exams need the network.

## Building the bank (the part that costs money — run on your machine)

The PDFs and everything extracted from them stay on your laptop. Nothing below runs in the browser.

```bash
# 1. Extract source slices (PDF page ranges in config/source-map.json) → content/source/*.md  (gitignored)
npm run extract:sources

# 2. Chunk + embed locally (Xenova/bge-small-en-v1.5 via transformers.js, downloads ~130 MB once) → source_chunks + FTS5
npm run index:sources

# 3. One task end to end, then STOP and read the output (Phase 2 gate)
npm run generate:lessons   -- --task 23
npm run generate:questions -- --task 23 --count 20
#    prints per-question QA verdicts, the run's cost, and the ×26 extrapolation

# 4. Only after you have read task 23's lesson and questions in the app and are happy:
npm run generate:lessons   -- --all
npm run generate:questions -- --task <n> --count 120      # per task, or queue runs from /admin and drain with:
npm run jobs
```

Anything that fails QA lands in `/admin/queue` (approve / edit / bin). `npm run qa:questions -- --task 23` re-runs QA after hand edits.

Runtime LLM calls are limited to: *explain this differently* (cached per question), *ask a follow-up* on a lesson (grounded; answers "I could not find this in your materials" when it cannot), the top-up queue (when an item's unseen pool < 15), and the weekly coaching summary. All respect the monthly cap; at 80% the admin page warns, at 100% they stop.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` / `build` / `start` | Dev server · production build (also builds `public/sw.js`) · serve |
| `npm run typecheck` · `lint` · `test` | tsc · ESLint · Vitest (40 tests, mock LLM, fixture corpus) |
| `npm run test:e2e` | Playwright smoke path on a throwaway DB. First time: `npx playwright install chromium` |
| `npm run db:generate` / `db:migrate` / `db:studio` | New migration after editing `src/db/schema.ts` · apply + seed · Drizzle Studio |
| `npm run extract:sources [slug]` | PDFs → `content/source/*.md` |
| `npm run index:sources [slug]` | Markdown → chunks + embeddings + FTS |
| `npm run generate:lessons -- --task N \| --all` | Lesson + 12 flashcards per task |
| `npm run generate:questions -- --task N --count C [--difficulty 1\|2\|3]` | Generate + QA questions |
| `npm run qa:questions -- --task N [--all] \| --id Q` | Re-run QA |
| `npm run jobs` | Drain queued top-up / admin generation runs |
| `npm run db:push` / `db:pull` | Local ⇄ Turso (everything except `source_chunks`) |
| `npm run deploy` | Checks → push DB → set Vercel env → `vercel --prod` |

Offline/dev switches: `LLM_TRANSPORT=mock` (no network, schema-valid fake output), `EMBEDDINGS=fake` (hash embedder). Tests set both.

## Layout

```
config/exams/pmp.ts     everything PMP-specific: domains, weights, 26 tasks, mindset rules, distractor families, roadmap
config/source-map.json  PDF page ranges per source slice
src/db/schema.ts        18 tables; exam-agnostic (exam_id everywhere, syllabus_items)
src/db/seed-data.ts     roadmap filler days, baseline session
src/lib/
  retrieval.ts          hybrid vector + FTS5, RRF, task re-rank, 8 chunks / 5k tokens
  chunking.ts           ~700-token chunks, heading-first, numbered processes kept whole; 25-word-run check
  embeddings.ts         transformers.js (or fake)
  llm.ts                OpenRouter client, model validation, usage rows, monthly cap, mock transport
  generation/           prompts · lessons · questions · qa · pipeline · support score · runtime features
  sessions.ts / exam.ts practice sessions · mock exam state machine (case gate, breaks, server clock)
  scoring.ts            all eight item types
  analytics.ts          gates, family tally, heatmap, pace, CSV
  fsrs.ts               ts-fsrs wrapper
src/app/(app)/          dashboard shell: Today, Plan, Lesson, Practice, Flashcards, Analytics, Errors, Exam, Admin, Design
src/app/(focus)/        single-focus surfaces: /session/[id], /exam/[id]
src/components/ui/      design system (radix + cva) · exhibit.tsx renders the 10 chart kinds
scripts/                CLIs (run with tsx)
drizzle/                migrations (committed)
```

## Restore from backup

All state is one SQLite file: `data/pmp.db`. Copy it somewhere safe; to restore, stop the server and copy it back. Migrations re-apply on boot. `/api/export` downloads a JSON dump of study data; `/api/export?format=csv` gives attempts in the tracker's columns. `content/source/` is regenerable from the PDFs.

## Regenerating one task's questions

```bash
npm run generate:questions -- --task 23 --count 40   # adds to the existing bank; near-duplicates are rejected by QA
```
To retire old ones: `/admin/queue?task=23&status=active` → Pull from bank / Bin.

## Security notes

- `.env`, `data/`, `content/source/` are gitignored. A grep for the OpenRouter key prefix finds nothing outside `.env`.
- Login: constant-time passphrase compare, 10 tries / 15 min per IP. API routes rate-limited; error output is redacted.
- The app is private. PMI material is licensed to one person; never deploy it publicly. `db:push` deliberately excludes `source_chunks`.
