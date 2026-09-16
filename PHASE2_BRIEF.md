# Phase 2 brief — generation, retrieval, and the design system

Hand this to Fable after it has committed Phase 1 to git and reported its spend. It supersedes §5, §6 and §7 of `FABLE_BUILD_PROMPT.md` where they differ, and adds §17–§20.

---

## Objective

At the end of Phase 2 I can open one ECO task in the app, read a lesson I trust, and answer 120 exam-realistic questions about it — none of which required me to open a PDF. Every AI-written sentence can be traced back to a page in a PMI publication.

Phase 2 does **not** build the practice loop, analytics, or the exam simulator. Those are Phase 3 and 4.

---

## §17 Retrieval layer (new — build this first)

Everything else in Phase 2 depends on it. Lessons, questions and the explain-feature all read from here, so nothing the model writes is ungrounded.

### 17.1 Chunking

`scripts/index-sources.ts`, run locally, never in your context.

- Input: the Markdown produced by `scripts/extract-sources.ts` (§4), which carries the book, section and **PDF page number** for each slice.
- Chunk to ~700 tokens with 120-token overlap, splitting on headings first and sentences second. Never split a numbered process description across chunks.
- Each chunk row stores: `source_book`, `source_section`, `pdf_page_start`, `pdf_page_end`, `printed_page`, `eco_task_ids` (array — a chunk can serve several), `text`, `embedding`.

### 17.2 Embeddings — local, not an API

Use `@huggingface/transformers` (transformers.js) with `Xenova/bge-small-en-v1.5`, 384 dimensions, running in Node on my machine.

Reasons, in order: it costs nothing; the PMI text never leaves my laptop, which matters because these publications are licensed to me and marked not for distribution; and 384-dim vectors over roughly 4,000 chunks is trivially fast. Do not send source text to any embedding API.

### 17.3 Vector store — the same database

libSQL has native vector search, so add a table, not a service:

```sql
CREATE TABLE source_chunks (
  id INTEGER PRIMARY KEY,
  source_book TEXT NOT NULL,
  source_section TEXT NOT NULL,
  pdf_page_start INTEGER,
  pdf_page_end INTEGER,
  printed_page TEXT,
  eco_task_ids TEXT,          -- JSON array
  text TEXT NOT NULL,
  embedding F32_BLOB(384)
);
CREATE INDEX idx_chunks_vec ON source_chunks (libsql_vector_idx(embedding));
```

Retrieve with `vector_top_k('idx_chunks_vec', vector32(?), ?)` joined back to the table, then re-rank: keep chunks whose `eco_task_ids` includes the task being asked about, and cap at 8 chunks / ~5,000 tokens per call.

**Hybrid, not pure vector.** Add an FTS5 table over the same text and merge the two result sets with reciprocal-rank fusion. PMI language is full of near-synonyms ("contingency reserve" vs "management reserve") that pure embeddings blur, and those distinctions are exactly what the exam tests.

### 17.4 Citations and how confident to sound

Every generated lesson section, question explanation and chat answer carries `citations[]`: `{chunk_id, source_book, source_section, printed_page, pdf_page, quote_span}`. The UI renders these as a footnote strip; clicking one opens the chunk text.

**On confidence scores — read this before implementing.** Do not ask the model "how confident are you, 0–100?" and display the number. Self-reported LLM confidence is poorly calibrated: it reflects fluency, not correctness, and it will read as authoritative while being close to noise. Showing me a confident-looking 92% on a wrong PMBOK claim is worse than showing me nothing.

Instead compute a **support score** from the retrieval, and label it as what it is:

| Signal | How |
|---|---|
| `retrieval_score` | best cosine similarity among cited chunks, 0–1 |
| `chunk_agreement` | how many distinct cited chunks independently support the claim |
| `is_grounded` | a second cheap call: "does the cited text actually support this sentence? yes/no/partly" |
| `support` | derived: `high` (grounded, ≥2 chunks, sim ≥0.72) · `medium` · `low` |

Render it as a word — **Well sourced · Partly sourced · Unsourced** — with the citations underneath, not a percentage. Anything scoring `low` is flagged in the admin queue rather than shown to me as fact. If a claim cannot be grounded at all, the answer says so: *"I could not find this in your materials"* is a useful answer; a fabricated page reference is not.

### 17.5 What retrieval must never do

Retrieved text goes into the model's context and comes out as **original prose**. Never more than 25 consecutive words from a source in any stored output; enforce this in the QA pass (§7) against `source_chunks.text`, not just the Markdown files.

---

## §18 Generation, revised

Lessons (§5) and questions (§6) work as originally specified, with three changes:

1. **Grounded prompts.** Every generation call retrieves first. The system prompt gets the retrieved chunks with their page references and is told to cite them. A lesson section with no citation is a QA failure.
2. **Citations stored.** `lessons` and `questions` both get a `citations_json` column and a `support` column.
3. **The one-task gate holds.** Generate and QA **task 23, *Plan and manage risk*, and nothing else** until I have read the output and said go. Risk is the hardest domain to generate well — if the pipeline is weak, it shows there first. Show me: the lesson, 20 questions across all difficulty levels, the QA report, and the citation strip.

Keep the 2026 corrections in the system prompt: quality and procurement are Governance processes, not domains; communications lives in Stakeholders; qualitative and quantitative risk analysis are one `Perform Risk Analysis` process.

---

## §19 Design system pass

The current UI is clean but generic. Build the design system **now**, before Phase 3 builds the practice and review screens on top of it — restyling those later costs more than doing it once.

- Install real **shadcn/ui** rather than the hand-written stand-ins in `src/components/ui.tsx`, and migrate existing components.
- **Typography.** Two families, not one: a display face with character for headings and numbers (Fraunces, Newsreader or Instrument Serif) and a workhorse sans for body and UI (Inter Tight, Geist or IBM Plex Sans). Set a real type scale and stay on it. Question stems get generous measure (~65 characters) and 1.7 line height — I read hundreds of these a day.
- **Palette.** Pick one considered accent and a neutral ramp with a slight hue bias toward it, instead of default grey. Reserve semantic colour (correct / incorrect / weak / strong) for meaning only — never decoration. Both themes designed, not inverted.
- **Density and hierarchy.** Today and Plan are scannable dashboards. Practice and Review are single-focus reading surfaces: one question, no chrome, no navigation competing for attention. Do not give both the same card treatment.
- **The answer-review screen is the most important screen in the app.** It shows: my answer, the correct answer, a rationale for *every* option, the distractor family I fell for, the PMBOK citation, and one action — add to review items. Design it deliberately.
- **Charts** use one scale system and take colour from theme tokens.
- Deliver a `/design` route showing every component in both themes, so drift is visible.

---

## §20 Make the schema exam-agnostic (cheap now, expensive later)

I want to build the same app for CFA Levels 1–3 after the PMP exam. Do **not** build any CFA feature now — but do make the data model exam-agnostic in this phase, because retrofitting it later means a migration across every table:

- Add an `exams` table: `id, code (PMP|CFA1|CFA2|CFA3), title, exam_date, question_count, minutes, domain_weights_json`.
- Rename `eco_tasks` → `syllabus_items` with `exam_id, parent_id, code, title, weight_pct, plan_day`. Keep a view named `eco_tasks` so nothing in Phase 1 breaks.
- Every content and attempt table gains `exam_id`.
- Move the PMP-specific mindset rules and distractor families out of code and into `config/exams/pmp.ts`, so a second exam is a new config file plus new source material, not a fork.

That is the whole CFA investment for now. Everything else waits until after 31 October.

---

## Revised budget

Phase 1 is done. Of the remaining credit:

| Phase | Scope | Target |
|---|---|---|
| 2 | Retrieval layer, extraction, lesson + question generation, QA, admin queue, exam-agnostic schema | $25 |
| 2.5 | Design system pass (§19) | $8 |
| 3 | Practice, review, flashcards, error log, analytics, CSV export | $15 |
| 4 | Exam simulator, PWA, Burmese locale, deploy, README | $7 |

If a phase overruns, cut in this order: Burmese locale, graphic-question rendering, Drizzle Studio niceties, the `/design` route. Never cut the QA pass or the citation strip — those are what make the content trustworthy.

Report spend at every gate before continuing.

---

## Phase 2 acceptance tests

1. `npm run index:sources` builds ~4,000 chunks; a similarity query for "contingency reserve versus management reserve" returns chunks from the Finance and Risk domains with correct page numbers.
2. Asking the app "when does a PM raise a change request?" returns an answer with at least two citations, each resolving to a real PMBOK 8 page.
3. Asking it something absent from my materials ("what is the CFA Level 1 pass rate?") returns *"I could not find this in your materials"* — not a guess.
4. 20 generated questions for *Plan and manage risk* all pass QA, each with per-option rationales, a distractor family on every wrong option, and a citation.
5. No stored output contains a run of 25+ words from any source chunk.
6. `llm_usage` shows the true cost of generating that task. Extrapolate it to 26 tasks and tell me the number before generating the rest.
7. `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` all pass, with output pasted.
