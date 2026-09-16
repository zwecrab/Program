# Decisions

Choices made where the build prompt left room. Each picks the cheaper / simpler option per §16.

## Phase 1

1. **Roadmap days not named in §14** (days 1–6, 13, 18–19, 27–28, 37–47) were filled in `src/db/seed-data.ts`: foundation week (format, baseline, principles, life cycles, mindset, Agile Practice Guide), domain review days, and mocks on days 19, 38, 44 with a mock-review day after each, day 43 = error-log read-through. Edit the two maps in that file and re-seed to change.
2. **ECO task IDs** are 1–8 People, 9–18 Process, 19–26 Business Environment, in the order §14 lists them. `task_number` is per-domain. `weight_pct` = domain weight ÷ tasks in domain (People 4.13, Process 4.1, BE 3.25).
3. **Baseline session** has no `attempts` rows because the 15 questions were external. `config_json` carries `{questions: 15, correct: 4}`; analytics (Phase 3) must read question count from there when attempts are absent.
4. **`eco_tasks` gained `studied` / `studied_at`** columns: the "I've studied this" toggle and the "all 26 tasks studied" gate need a home, and the prompt says the toggle "writes to `eco_tasks`".
5. **`questions.status`** vocabulary: `draft | qa_pending | active | quarantined | failed | retired`. Only `active` is served.
6. **shadcn/ui** is used as a style, not installed via CLI — `src/components/ui.tsx` holds hand-written equivalents. Saves a dependency tree and credit; swap in real shadcn components later if wanted.
7. **Auth in middleware** verifies the iron-session cookie on every request; API routes get 401 JSON, pages get redirected to `/login?next=`.
8. **Migrations run at boot** via `instrumentation.ts` (and `npm run db:migrate` for CLIs). `drizzle/` is included in the serverless bundle through `outputFileTracingIncludes`.
9. **Playwright** uses the Chromium "Pixel 5" profile (WebKit is not available everywhere). `PW_CHROMIUM_PATH` lets you point at a system Chromium.
10. **OpenRouter model validation at startup** (§2) is deferred to Phase 2, when the LLM client exists; Phase 1 has no LLM code by design.
11. **`next-pwa`** deferred to Phase 4; Phase 1 ships the manifest and mobile layout only.
