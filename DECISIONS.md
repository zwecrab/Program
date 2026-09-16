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
