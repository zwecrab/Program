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

## Phase 1 hotfix (16 Sep 2026)

12. **`eco_tasks.weight_pct` is the domain weight (33 / 41 / 26), not a per-task share.** Dividing produced rounding drift (People 8 × 4.13 = 33.04). PMI publishes weights per domain, so the column now carries the domain figure verbatim; `settings.domain_weights_json` holds the same map. Analytics aggregate by domain and must never sum `weight_pct` across tasks. The seed repairs existing rows on boot. Phase 2 §20 moves this into `exams.domain_weights_json`.

13. **Item types and answer shape.** `ITEM_TYPES` is the exam's eight: `single`, `multi`, `matching`, `enhanced_matching`, `point_and_click`, `pull_down_list`, `graphic`, `case`. "ordering" and "calculation" were removed — numeric items are `single`/`multi` tagged `style = "calculation"`. Answer keys live in one of two places, validated per type in `src/lib/question-schema.ts`:

    | Item type | Key lives in | Rule |
    |---|---|---|
    | `single`, `case` | `options` table | exactly 1 correct |
    | `multi` | `options` table | 2–3 correct |
    | `graphic` | `options` table + `exhibit_json` chart spec (`kind` ∈ burndown, burnup, network_diagram, control_chart, pareto, tornado, evm_dashboard, histogram, kanban, power_interest_grid) | exactly 1 correct |
    | `matching` | `exhibit_json` `{kind, left[], right[], answer[{left,right}], rationales{leftId}}` | every left keyed once, every right used once |
    | `enhanced_matching` | same shape, `kind: "enhanced_matching"` | ≥1 right item unused; each unused one carries `distractor_family` + `rationale` |
    | `point_and_click` | `exhibit_json` `{kind, base (chart spec or diagram description), regions[{id,label,rect{x,y,w,h} 0–1, is_correct, distractor_family?, rationale}]}` | exactly 1 correct region |
    | `pull_down_list` | `exhibit_json` `{kind, template "… {{blankId}} …", blanks[{id, choices[{id,text,is_correct,distractor_family?,rationale}]}]}` | each blank exactly 1 correct; every placeholder ↔ blank |

    Exhibit-keyed types must have zero rows in `options` and a non-empty `explanation_md`. In every type, a wrong choice needs a `distractor_family` and a `rationale`; a correct choice needs a `rationale` and no family. The manual entry form only offers the four option-based types; the other four arrive with the generator.

14. **Which brief is canonical.** `prompt.md` and `FABLE_BUILD_PROMPT.md` were byte-identical apart from CRLF line endings; `FABLE_BUILD_PROMPT.md` is kept because `PHASE2_BRIEF.md` refers to it by name. `PHASE2_BRIEF.md` supersedes its §5–§7 and adds §17–§20.

## Phase 2 (retrieval, generation, exam-agnostic schema)

15. **Schema §20 done first, on empty tables.** `eco_tasks` → `syllabus_items` (+`exam_id`, `parent_id`, `code`), `exams` table, `exam_id` on every content/activity table, `citations_json` + `support` on lessons and questions, `qa_json` on questions. Migration `0001_exam_agnostic.sql` is hand-composed (drizzle-kit cannot express the FTS5 table, the vector index or the `eco_tasks` view) and preserves the baseline session and any ticked days. Domain columns are plain text; PMP's vocabulary lives in `config/exams/pmp.ts`.
16. **CSV columns.** I never saw the Excel tracker, so `/api/export?format=csv` emits: Date, Session, Kind, Domain, ECO Task, Task Title, Question ID, Item Type, Difficulty, Style, Correct, Distractor Family, Seconds, Confidence, Pretest — plus one summary line for the 16 Sep baseline. Rename/reorder in `src/lib/analytics.ts › attemptsCsv` to match the workbook.
17. **Agile Practice Guide / Change guide page ranges** are not in the brief. `source-map.json` extracts the whole PDF and keeps pages whose top matches "Chapter 2–5" / "Chapter 6"; if the heuristic finds nothing it keeps everything rather than emit an empty file. Replace `pages: null` with a verified range when you have it.
18. **Chunk → task tagging** (`sourceToSyllabus` in the config) is a hand map from source slice to the ECO tasks it mainly serves. It only boosts ranking (×1.5), never filters, so cross-domain facts still surface.
19. **Support score** = retrieval similarity + chunk agreement + a strict yes/partly/no grounding call; rendered as *Well sourced / Partly sourced / Unsourced*, never a percentage. A lesson section or question with `low` support is flagged, not hidden; a 25-word run against any indexed chunk forces `low`.
20. **QA hard rules override the reviewer**: a second defensible answer or a task mismatch is always `reject`; an unstated-fact dependency, stem leak, verb inconsistency, family mislabel or ungrounded claim downgrades `pass` to `revise`. One revision, then quarantine. Correct-option positions are balanced across each batch before insert; batch-level position (>35%) and longest-option (>30%) bias is reported.
21. **Generation runs on your machine**, not in the browser and not in a hosted function: the admin page *queues* runs (`generation_runs.status = queued`) and `npm run jobs` performs them. Reasons: PMI text must not leave the laptop, and generation of 120 questions takes minutes.
22. **shadcn/ui via local authoring.** The shadcn registry is not reachable from every build environment, so `src/components/ui/index.tsx` holds the same components (cva variants, Radix primitives, `cn`) written locally. Fonts are self-hosted from `@fontsource-variable` (Fraunces, Inter Tight) rather than Google Fonts, for the same reason.
23. **Route groups**: `(app)` = dashboards with navigation; `(focus)` = practice sessions and the exam, with no chrome competing for attention.
24. **`db:push` excludes `source_chunks`.** The deployed app serves the bank, lessons and analytics; retrieval-backed runtime features (ask, explain) run only where the chunks are — your laptop. Vercel gets `EMBEDDINGS=fake` so nothing tries to load the model there.

## Phase 3 / 4

25. **Exam clock** is server-side (`deadline_at` in `sessions.state_json`); every mutation checks it and auto-submits on expiry. Breaks stop the clock by pushing the deadline out by the break actually used (≤10 min). Leaving the case block records those attempts immediately and sets `case_locked`; later `saveAnswer` calls for case items are refused.
26. **Pretest items**: 10 random non-case questions per paper are flagged in state and on their `attempts.pretest`; every score in the app excludes them, mirroring PMI.
27. **Short papers**: when the bank has fewer than 180 active questions the mock uses what exists and says so; percentages still report.
28. **FSRS** via `ts-fsrs` with short-term steps and fuzz on; card state is the five FSRS fields stored on `flashcards`.
29. **i18n**: UI strings in `src/i18n/{en,my}.json`; PMI terms stay English in both. Lesson bodies carry a Burmese summary section from the generator.
