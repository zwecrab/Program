# PMP Trainer

Private, single-user PMP exam prep app. 2026 ECO + PMBOK Guide 8th Edition. Exam: **31 Oct 2026**.

This README is written for you in six months. Start at *Setup*.

## Setup (fresh clone)

```bash
npm install
cp .env.example .env         # then fill in the three required secrets below
npm run dev                  # http://localhost:3000
```

Required in `.env` (the app refuses to start without them and says which is missing):

| Key | What |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter key. Server-side only, never shipped to the browser. |
| `APP_PASSPHRASE` | The one passphrase you type on the login screen. |
| `SESSION_SECRET` | ≥32 random characters. `openssl rand -hex 32` |

Optional: `DATABASE_URL` (default `file:./data/pmp.db`), `TURSO_AUTH_TOKEN` (prod), `OPENROUTER_MODEL`, `MONTHLY_LLM_CAP_USD` (default 5), `SOURCE_DIR` (where the PMI PDFs live).

On first boot the app runs migrations and seeds: 26 ECO tasks, the 47-day roadmap (day 1 = 15 Sep 2026), and the 16 Sep 2026 cold-baseline session (15 questions, 4 correct, 26.7%). Seeding is idempotent.

To use it on your phone on the same Wi-Fi: `npm run dev -- -H 0.0.0.0` and open `http://<laptop-ip>:3000`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server, local SQLite, no cloud needed |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`) |
| `npm run test:e2e` | Playwright smoke test on a throwaway DB (`data/e2e.db`). First time: `npx playwright install chromium` |
| `npm run db:generate` | Create a new migration after editing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations + seed to `DATABASE_URL` (the app also does this on boot) |
| `npm run db:studio` | Drizzle Studio GUI over the DB |

Phase 2+ will add: `extract:sources`, `generate:lessons`, `generate:questions`, `qa:questions`, `db:push`, `db:pull`, `deploy`.

## Layout

```
src/app/            screens (App Router). page.tsx = Today
  plan/             47-day roadmap, tickable
  lesson/[id]/      one ECO task; "studied" toggle
  admin/            bank composition, spend; questions/new = manual entry
  api/auth/login    POST passphrase → cookie; DELETE = sign out
src/db/schema.ts    the 13 tables + closed vocabularies (domains, item types, distractor families)
src/db/seed-data.ts ECO tasks, roadmap, baseline — edit here, not in the DB
src/lib/            env, session, auth, plan calendar, question zod schema
drizzle/            generated SQL migrations (committed)
scripts/            one-off CLIs run with tsx
e2e/                Playwright
```

## Restore from backup

The whole state is one SQLite file: `data/pmp.db`. Copy it somewhere safe; to restore, stop the server and copy it back. Migrations re-apply automatically on next boot. (Turso sync scripts arrive in Phase 4.)

## Security notes

- `.env`, `data/`, `content/source/` are gitignored. a grep for the OpenRouter key prefix should find nothing outside `.env`.
- Login is rate-limited (10 tries / 15 min per IP). Passphrase comparison is constant-time.
- The app is private. PMI material is licensed to one person; never deploy it publicly.
