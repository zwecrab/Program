import { sqliteTable, text, integer, real, primaryKey, index, customType, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { PMP } from "../../config/exams/pmp";

// ---------------------------------------------------------------------------
// Closed vocabularies. Exam-specific ones (domains, distractor families) live
// in config/exams/*.ts; the DB columns are plain text so a second exam is a
// config file, not a migration.
// ---------------------------------------------------------------------------

export const DELIVERY_APPROACHES = ["predictive", "adaptive", "hybrid"] as const;

/**
 * The eight item types on the 2026 PMP exam. Numeric questions are `single`
 * or `multi` with `style = "calculation"`; "calculation" is not an item type.
 * Answer shape per type is defined in src/lib/question-schema.ts.
 */
export const ITEM_TYPES = [
  "single", // multiple-choice, one correct answer
  "multi", // multiple-response, 2–3 correct
  "matching", // match items across two lists
  "enhanced_matching", // matching with right-side entries that match nothing
  "point_and_click", // click a region of an exhibit
  "pull_down_list", // one or more in-sentence dropdowns
  "graphic", // built on a rendered chart or diagram
  "case", // part of a linked case-study cluster
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Types whose answers live in the `options` table. The other four keep their key in `exhibit_json`. */
export const OPTION_BASED_ITEM_TYPES = ["single", "multi", "graphic", "case"] as const satisfies readonly ItemType[];

export const STYLES = ["what_should_pm_do", "first", "next", "best", "concept", "calculation"] as const;
export const QUESTION_STATUSES = ["draft", "qa_pending", "active", "quarantined", "failed", "retired"] as const;
export const SUPPORT_LEVELS = ["high", "medium", "low"] as const;
export type SupportLevel = (typeof SUPPORT_LEVELS)[number];

/** PMP distractor families, re-exported for code that predates the config split. */
export const DISTRACTOR_FAMILIES = PMP.distractorFamilies as readonly [
  "escalate_prematurely",
  "wait_or_defer",
  "act_without_analysis",
  "overcorrect",
  "complacent_aggregate_read",
  "wrong_document_bucket",
  "risk_issue_confusion",
  "invented_process",
  "wrong_delivery_approach",
  "role_boundary_violation",
];
export type DistractorFamily = (typeof DISTRACTOR_FAMILIES)[number];
export const DOMAINS = PMP.domains;
export type Domain = (typeof DOMAINS)[number];

export const SESSION_KINDS = ["mini", "practice", "mock", "flashcards", "lesson"] as const;
export const CARD_TYPES = ["recall", "discrimination", "application"] as const;
export const RUN_KINDS = ["lesson", "questions", "qa", "topup", "coaching", "index"] as const;
export const RUN_STATUSES = ["queued", "running", "done", "failed"] as const;

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** libSQL native vector column. */
const f32Blob = (dims: number) =>
  customType<{ data: Buffer; driverData: Buffer }>({
    dataType() {
      return `F32_BLOB(${dims})`;
    },
  });

// ---------------------------------------------------------------------------
// Exam + syllabus (Phase 2 §20)
// ---------------------------------------------------------------------------

export const exams = sqliteTable("exams", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  examDate: text("exam_date").notNull(),
  questionCount: integer("question_count").notNull(),
  minutes: integer("minutes").notNull(),
  domainWeightsJson: text("domain_weights_json").notNull(),
});

/** Was `eco_tasks`. A view with that name still exists for compatibility. */
export const syllabusItems = sqliteTable(
  "syllabus_items",
  {
    id: integer("id").primaryKey(),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id),
    parentId: integer("parent_id"),
    code: text("code").notNull(),
    domain: text("domain").notNull(),
    taskNumber: integer("task_number").notNull(),
    title: text("title").notNull(),
    /** Weight of this item's DOMAIN on the exam — not divided across items (DECISIONS #12). */
    weightPct: real("weight_pct").notNull(),
    planDay: integer("plan_day").notNull(),
    studied: integer("studied", { mode: "boolean" }).notNull().default(false),
    studiedAt: text("studied_at"),
  },
  (t) => [uniqueIndex("syllabus_exam_code_idx").on(t.examId, t.code)],
);

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export const lessons = sqliteTable("lessons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id),
  syllabusItemId: integer("syllabus_item_id")
    .notNull()
    .references(() => syllabusItems.id),
  version: integer("version").notNull().default(1),
  titleEn: text("title_en").notNull(),
  titleMy: text("title_my"),
  bodyMd: text("body_md").notNull(),
  predictiveMd: text("predictive_md"),
  adaptiveMd: text("adaptive_md"),
  trapsMd: text("traps_md"),
  artifactsMd: text("artifacts_md"),
  exampleMd: text("example_md"),
  pmbokRefsJson: text("pmbok_refs_json"),
  citationsJson: text("citations_json"),
  support: text("support", { enum: SUPPORT_LEVELS }),
  generatedAt: text("generated_at").notNull().default(now),
  modelUsed: text("model_used"),
  reviewed: integer("reviewed", { mode: "boolean" }).notNull().default(false),
});

export const flashcards = sqliteTable(
  "flashcards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id),
    syllabusItemId: integer("syllabus_item_id")
      .notNull()
      .references(() => syllabusItems.id),
    lessonId: integer("lesson_id").references(() => lessons.id),
    front: text("front").notNull(),
    back: text("back").notNull(),
    cardType: text("card_type", { enum: CARD_TYPES }).notNull().default("recall"),
    fsrsStability: real("fsrs_stability").notNull().default(0),
    fsrsDifficulty: real("fsrs_difficulty").notNull().default(0),
    fsrsState: integer("fsrs_state").notNull().default(0),
    lastReviewAt: text("last_review_at"),
    dueAt: text("due_at").notNull().default(now),
    lapses: integer("lapses").notNull().default(0),
    reps: integer("reps").notNull().default(0),
  },
  (t) => [index("flashcards_due_idx").on(t.dueAt)],
);

export const questions = sqliteTable(
  "questions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id),
    syllabusItemId: integer("syllabus_item_id")
      .notNull()
      .references(() => syllabusItems.id),
    domain: text("domain").notNull(),
    deliveryApproach: text("delivery_approach", { enum: DELIVERY_APPROACHES }).notNull(),
    itemType: text("item_type", { enum: ITEM_TYPES }).notNull(),
    difficulty: integer("difficulty").notNull(),
    style: text("style", { enum: STYLES }).notNull(),
    stem: text("stem").notNull(),
    exhibitJson: text("exhibit_json"),
    explanationMd: text("explanation_md").notNull().default(""),
    pmbokRef: text("pmbok_ref"),
    citationsJson: text("citations_json"),
    support: text("support", { enum: SUPPORT_LEVELS }),
    qaJson: text("qa_json"),
    sourceBatch: text("source_batch"),
    status: text("status", { enum: QUESTION_STATUSES }).notNull().default("qa_pending"),
    /** Marked at exam time: unscored pretest items are drawn from here too, so no column needed. */
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("questions_item_status_idx").on(t.syllabusItemId, t.status), index("questions_exam_status_idx").on(t.examId, t.status)],
);

export const options = sqliteTable("options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  body: text("body").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" }).notNull().default(false),
  distractorFamily: text("distractor_family"),
  rationale: text("rationale").notNull().default(""),
});

export const caseStudies = sqliteTable("case_studies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id),
  scenarioMd: text("scenario_md").notNull(),
  domainMix: text("domain_mix"),
  exhibitJson: text("exhibit_json"),
});

export const caseQuestions = sqliteTable(
  "case_questions",
  {
    caseStudyId: integer("case_study_id")
      .notNull()
      .references(() => caseStudies.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
  },
  (t) => [primaryKey({ columns: [t.caseStudyId, t.questionId] })],
);

// ---------------------------------------------------------------------------
// Study activity
// ---------------------------------------------------------------------------

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id),
  kind: text("kind", { enum: SESSION_KINDS }).notNull(),
  startedAt: text("started_at").notNull().default(now),
  endedAt: text("ended_at"),
  configJson: text("config_json"),
  /** Server-side runtime state (question order, current index, timer, case gate). */
  stateJson: text("state_json"),
  scorePct: real("score_pct"),
});

export const attempts = sqliteTable(
  "attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    chosenOptionIdsJson: text("chosen_option_ids_json").notNull().default("[]"),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
    /** Family of the wrong choice the learner picked, copied at answer time for analytics. */
    distractorFamily: text("distractor_family"),
    secondsSpent: integer("seconds_spent"),
    confidence: integer("confidence"),
    /** Unscored pretest item in a mock (build prompt §9). */
    pretest: integer("pretest", { mode: "boolean" }).notNull().default(false),
    answeredAt: text("answered_at").notNull().default(now),
  },
  (t) => [index("attempts_session_idx").on(t.sessionId), index("attempts_question_idx").on(t.questionId)],
);

export const reviewItems = sqliteTable("review_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id),
  ruleBroken: text("rule_broken"),
  distractorFamily: text("distractor_family"),
  note: text("note"),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now),
});

export const studyDays = sqliteTable(
  "study_days",
  {
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id),
    day: integer("day").notNull(),
    date: text("date").notNull(),
    phase: text("phase").notNull(),
    focus: text("focus").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    hours: real("hours"),
    notes: text("notes"),
  },
  (t) => [primaryKey({ columns: [t.examId, t.day] })],
);

// ---------------------------------------------------------------------------
// Retrieval (Phase 2 §17)
// ---------------------------------------------------------------------------

export const EMBEDDING_DIMS = 384;

export const sourceChunks = sqliteTable(
  "source_chunks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    examId: integer("exam_id")
      .notNull()
      .references(() => exams.id),
    sourceBook: text("source_book").notNull(),
    sourceSection: text("source_section").notNull(),
    sourceSlug: text("source_slug").notNull(),
    pdfPageStart: integer("pdf_page_start"),
    pdfPageEnd: integer("pdf_page_end"),
    printedPage: text("printed_page"),
    /** JSON array of syllabus item ids this chunk serves. */
    syllabusItemIds: text("syllabus_item_ids").notNull().default("[]"),
    text: text("text").notNull(),
    tokenCount: integer("token_count").notNull().default(0),
    embedding: f32Blob(EMBEDDING_DIMS)("embedding"),
  },
  (t) => [index("source_chunks_slug_idx").on(t.sourceSlug)],
);
// The vector index and the FTS5 shadow table are created in the migration SQL
// by hand (drizzle-kit cannot express them): idx_chunks_vec, source_chunks_fts.

// ---------------------------------------------------------------------------
// LLM bookkeeping
// ---------------------------------------------------------------------------

export const llmUsage = sqliteTable("llm_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id").references(() => exams.id),
  calledAt: text("called_at").notNull().default(now),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  runId: integer("run_id"),
});

export const generationRuns = sqliteTable("generation_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id),
  kind: text("kind", { enum: RUN_KINDS }).notNull(),
  syllabusItemId: integer("syllabus_item_id"),
  status: text("status", { enum: RUN_STATUSES }).notNull().default("queued"),
  paramsJson: text("params_json"),
  requested: integer("requested").notNull().default(0),
  produced: integer("produced").notNull().default(0),
  passed: integer("passed").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
  log: text("log").notNull().default(""),
  createdAt: text("created_at").notNull().default(now),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
});

/** "Explain this differently" — one call per question, cached forever. */
export const explanations = sqliteTable("explanations", {
  questionId: integer("question_id")
    .primaryKey()
    .references(() => questions.id, { onDelete: "cascade" }),
  bodyMd: text("body_md").notNull(),
  citationsJson: text("citations_json"),
  support: text("support", { enum: SUPPORT_LEVELS }),
  createdAt: text("created_at").notNull().default(now),
});

export const coachingSummaries = sqliteTable("coaching_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  examId: integer("exam_id")
    .notNull()
    .references(() => exams.id),
  weekStart: text("week_start").notNull(),
  bodyMd: text("body_md").notNull(),
  statsJson: text("stats_json"),
  createdAt: text("created_at").notNull().default(now),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Exam = typeof exams.$inferSelect;
export type SyllabusItem = typeof syllabusItems.$inferSelect;
export type StudyDay = typeof studyDays.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Option = typeof options.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type Flashcard = typeof flashcards.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type ReviewItem = typeof reviewItems.$inferSelect;
export type SourceChunk = typeof sourceChunks.$inferSelect;
export type GenerationRun = typeof generationRuns.$inferSelect;
