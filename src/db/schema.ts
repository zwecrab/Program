import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Closed vocabularies (kept here so schema + zod + UI agree on one source)
// ---------------------------------------------------------------------------

export const DOMAINS = ["people", "process", "business_environment"] as const;
export type Domain = (typeof DOMAINS)[number];

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
export const DIFFICULTIES = [1, 2, 3] as const;
export const STYLES = ["what_should_pm_do", "first", "next", "best", "concept", "calculation"] as const;
export const QUESTION_STATUSES = ["draft", "qa_pending", "active", "quarantined", "failed", "retired"] as const;

export const DISTRACTOR_FAMILIES = [
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
] as const;
export type DistractorFamily = (typeof DISTRACTOR_FAMILIES)[number];

export const SESSION_KINDS = ["mini", "practice", "mock", "flashcards", "lesson"] as const;
export const CARD_TYPES = ["recall", "discrimination", "application"] as const;

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// ---------------------------------------------------------------------------
// Tables — names exactly as specified in the build prompt
// ---------------------------------------------------------------------------

export const ecoTasks = sqliteTable("eco_tasks", {
  id: integer("id").primaryKey(),
  domain: text("domain", { enum: DOMAINS }).notNull(),
  taskNumber: integer("task_number").notNull(),
  title: text("title").notNull(),
  /** Weight of this task's DOMAIN on the exam (33/41/26) — not divided across tasks. See DECISIONS.md #12. */
  weightPct: real("weight_pct").notNull(),
  planDay: integer("plan_day").notNull(),
  studied: integer("studied", { mode: "boolean" }).notNull().default(false),
  studiedAt: text("studied_at"),
});

export const lessons = sqliteTable("lessons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ecoTaskId: integer("eco_task_id").notNull().references(() => ecoTasks.id),
  version: integer("version").notNull().default(1),
  titleEn: text("title_en").notNull(),
  titleMy: text("title_my"),
  bodyMd: text("body_md").notNull(),
  predictiveMd: text("predictive_md"),
  adaptiveMd: text("adaptive_md"),
  trapsMd: text("traps_md"),
  artifactsMd: text("artifacts_md"),
  pmbokRefsJson: text("pmbok_refs_json"),
  generatedAt: text("generated_at").notNull().default(now),
  modelUsed: text("model_used"),
  reviewed: integer("reviewed", { mode: "boolean" }).notNull().default(false),
});

export const flashcards = sqliteTable(
  "flashcards",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ecoTaskId: integer("eco_task_id").notNull().references(() => ecoTasks.id),
    lessonId: integer("lesson_id").references(() => lessons.id),
    front: text("front").notNull(),
    back: text("back").notNull(),
    cardType: text("card_type", { enum: CARD_TYPES }).notNull().default("recall"),
    fsrsStability: real("fsrs_stability").notNull().default(0),
    fsrsDifficulty: real("fsrs_difficulty").notNull().default(0),
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
    ecoTaskId: integer("eco_task_id").notNull().references(() => ecoTasks.id),
    domain: text("domain", { enum: DOMAINS }).notNull(),
    deliveryApproach: text("delivery_approach", { enum: DELIVERY_APPROACHES }).notNull(),
    itemType: text("item_type", { enum: ITEM_TYPES }).notNull(),
    difficulty: integer("difficulty").notNull(),
    style: text("style", { enum: STYLES }).notNull(),
    stem: text("stem").notNull(),
    exhibitJson: text("exhibit_json"),
    explanationMd: text("explanation_md").notNull().default(""),
    pmbokRef: text("pmbok_ref"),
    sourceBatch: text("source_batch"),
    status: text("status", { enum: QUESTION_STATUSES }).notNull().default("active"),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => [index("questions_task_status_idx").on(t.ecoTaskId, t.status)],
);

export const options = sqliteTable("options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  body: text("body").notNull(),
  isCorrect: integer("is_correct", { mode: "boolean" }).notNull().default(false),
  distractorFamily: text("distractor_family", { enum: DISTRACTOR_FAMILIES }),
  rationale: text("rationale").notNull().default(""),
});

export const caseStudies = sqliteTable("case_studies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: SESSION_KINDS }).notNull(),
  startedAt: text("started_at").notNull().default(now),
  endedAt: text("ended_at"),
  configJson: text("config_json"),
  scorePct: real("score_pct"),
});

export const attempts = sqliteTable(
  "attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    questionId: integer("question_id")
      .notNull()
      .references(() => questions.id),
    chosenOptionIdsJson: text("chosen_option_ids_json").notNull().default("[]"),
    isCorrect: integer("is_correct", { mode: "boolean" }).notNull(),
    secondsSpent: integer("seconds_spent"),
    confidence: integer("confidence"),
    answeredAt: text("answered_at").notNull().default(now),
  },
  (t) => [index("attempts_session_idx").on(t.sessionId), index("attempts_question_idx").on(t.questionId)],
);

export const reviewItems = sqliteTable("review_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id),
  ruleBroken: text("rule_broken"),
  distractorFamily: text("distractor_family", { enum: DISTRACTOR_FAMILIES }),
  note: text("note"),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(now),
});

export const studyDays = sqliteTable("study_days", {
  day: integer("day").primaryKey(),
  date: text("date").notNull(),
  phase: text("phase").notNull(),
  focus: text("focus").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  hours: real("hours"),
  notes: text("notes"),
});

export const llmUsage = sqliteTable("llm_usage", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  calledAt: text("called_at").notNull().default(now),
  purpose: text("purpose").notNull(),
  model: text("model").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull().default(0),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type EcoTask = typeof ecoTasks.$inferSelect;
export type StudyDay = typeof studyDays.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Option = typeof options.$inferSelect;
export type Session = typeof sessions.$inferSelect;
