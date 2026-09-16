/**
 * Practice and mock sessions: question selection, server-side state, answer
 * recording. State lives in sessions.state_json so closing the tab and coming
 * back resumes exactly where you were — with the clock still running for mocks.
 */
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, options, questions, sessions, syllabusItems, type Option, type Question } from "@/db/schema";
import { getExamId } from "@/db/queries";
import { scoreAnswer, type Chosen } from "@/lib/scoring";
import type { Exhibit } from "@/lib/question-schema";
import { enqueueTopUpIfNeeded } from "@/lib/generation/runtime";
import { PMP } from "../../config/exams/pmp";

export type PracticeMode = "task" | "domain" | "mixed" | "weak" | "unseen";

export interface PracticeConfig {
  mode: PracticeMode;
  taskId?: number | null;
  domain?: string | null;
  count: number;
  timed: boolean;
  /** Seconds per question when timed (default: exam pace). */
  secondsPerQuestion?: number;
}

export interface SessionState {
  order: number[];
  index: number;
  /** Mock only */
  pretestIds?: number[];
  caseIds?: number[];
  stage?: "case" | "break1" | "main" | "break2" | "main2" | "done";
  caseLocked?: boolean;
  deadlineAt?: string;
  breaksTaken?: number;
  breakUntil?: string | null;
  /** Practice: per-question started-at for timing */
  currentStartedAt?: string;
  answered: number[];
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function weakTaskIds(): Promise<number[]> {
  const rows = await db
    .select({ id: questions.syllabusItemId, n: sql<number>`count(*)`, c: sql<number>`sum(case when ${attempts.isCorrect} then 1 else 0 end)` })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .groupBy(questions.syllabusItemId);
  return rows
    .filter((r) => Number(r.n) >= 3)
    .map((r) => ({ id: r.id, pct: Number(r.c) / Number(r.n) }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6)
    .map((r) => r.id);
}

export async function pickPracticeQuestions(cfg: PracticeConfig): Promise<number[]> {
  const examId = await getExamId();
  const conds = [eq(questions.examId, examId), eq(questions.status, "active")];
  if (cfg.mode === "task" && cfg.taskId) conds.push(eq(questions.syllabusItemId, cfg.taskId));
  if (cfg.mode === "domain" && cfg.domain) conds.push(eq(questions.domain, cfg.domain));
  if (cfg.mode === "weak") {
    const weak = await weakTaskIds();
    if (weak.length) conds.push(inArray(questions.syllabusItemId, weak));
  }
  if (cfg.mode === "unseen") conds.push(sql`${questions.id} NOT IN (select question_id from attempts)`);
  // Prefer unseen questions first in every mode, then least-recently attempted.
  const rows = await db
    .select({ id: questions.id, seen: sql<number>`(select count(*) from attempts a where a.question_id = ${questions.id})` })
    .from(questions)
    .where(and(...conds));
  const unseen = shuffle(rows.filter((r) => Number(r.seen) === 0).map((r) => r.id), Date.now() & 0xffff);
  const seen = shuffle(rows.filter((r) => Number(r.seen) > 0).map((r) => r.id), (Date.now() >> 3) & 0xffff);
  return [...unseen, ...seen].slice(0, cfg.count);
}

export async function createPracticeSession(cfg: PracticeConfig): Promise<{ id: number; count: number }> {
  const examId = await getExamId();
  const order = await pickPracticeQuestions(cfg);
  if (order.length === 0) throw new Error("No active questions match this configuration yet. Generate some first (Admin → Generation jobs).");
  const state: SessionState = { order, index: 0, answered: [], currentStartedAt: new Date().toISOString() };
  const [row] = await db
    .insert(sessions)
    .values({ examId, kind: "practice", configJson: JSON.stringify({ ...cfg, secondsPerQuestion: cfg.secondsPerQuestion ?? PMP.pacingSecondsPerQuestion }), stateJson: JSON.stringify(state) })
    .returning({ id: sessions.id });
  return { id: row.id, count: order.length };
}

export interface LoadedQuestion {
  question: Question;
  options: Option[];
  exhibit: Exhibit | null;
  taskTitle: string;
  taskCode: string;
}

export async function loadQuestion(id: number): Promise<LoadedQuestion | null> {
  const [q] = await db.select().from(questions).where(eq(questions.id, id)).limit(1);
  if (!q) return null;
  const opts = await db.select().from(options).where(eq(options.questionId, id)).orderBy(asc(options.label));
  const [item] = await db.select({ title: syllabusItems.title, code: syllabusItems.code }).from(syllabusItems).where(eq(syllabusItems.id, q.syllabusItemId)).limit(1);
  return { question: q, options: opts, exhibit: q.exhibitJson ? (JSON.parse(q.exhibitJson) as Exhibit) : null, taskTitle: item?.title ?? "", taskCode: item?.code ?? "" };
}

export async function loadSession(id: number) {
  const [s] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!s) return null;
  return { session: s, state: JSON.parse(s.stateJson ?? "{}") as SessionState, config: JSON.parse(s.configJson ?? "{}") as PracticeConfig & Record<string, unknown> };
}

export async function saveState(id: number, state: SessionState) {
  await db.update(sessions).set({ stateJson: JSON.stringify(state) }).where(eq(sessions.id, id));
}

export interface AnswerResult {
  isCorrect: boolean;
  family: string | null;
  parts?: Array<{ id: string; correct: boolean }>;
  attemptId: number;
  done: boolean;
}

/** Score, record the attempt, advance the pointer. Idempotent per question within a session. */
export async function recordAnswer(sessionId: number, questionId: number, chosen: Chosen, secondsSpent: number | null, confidence: number | null): Promise<AnswerResult> {
  const loaded = await loadSession(sessionId);
  if (!loaded) throw new Error("session not found");
  const { session, state } = loaded;
  const lq = await loadQuestion(questionId);
  if (!lq) throw new Error("question not found");
  const score = scoreAnswer(lq.question.itemType, lq.options, lq.exhibit, chosen);
  const pretest = !!state.pretestIds?.includes(questionId);

  const [existing] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.sessionId, sessionId), eq(attempts.questionId, questionId)))
    .limit(1);
  let attemptId = existing?.id;
  if (!attemptId) {
    const [row] = await db
      .insert(attempts)
      .values({
        examId: session.examId,
        sessionId,
        questionId,
        chosenOptionIdsJson: JSON.stringify(chosen),
        isCorrect: score.isCorrect,
        distractorFamily: score.family,
        secondsSpent,
        confidence,
        pretest,
      })
      .returning({ id: attempts.id });
    attemptId = row.id;
  }
  if (!state.answered.includes(questionId)) state.answered.push(questionId);
  const idx = state.order.indexOf(questionId);
  if (idx >= 0 && idx >= state.index) state.index = idx + 1;
  state.currentStartedAt = new Date().toISOString();
  const done = state.answered.length >= state.order.length;
  await saveState(sessionId, state);
  if (done && session.kind === "practice") await finishSession(sessionId);
  // Build prompt §6.4: top-up when the unseen pool runs low (queued, never blocking).
  enqueueTopUpIfNeeded(lq.question.syllabusItemId).catch(() => {});
  return { ...score, attemptId, done };
}

export async function finishSession(sessionId: number) {
  const [agg] = await db
    .select({ n: sql<number>`count(*)`, c: sql<number>`sum(case when ${attempts.isCorrect} then 1 else 0 end)` })
    .from(attempts)
    .where(and(eq(attempts.sessionId, sessionId), eq(attempts.pretest, false)));
  const n = Number(agg?.n ?? 0);
  const pct = n ? (Number(agg.c) / n) * 100 : null;
  await db.update(sessions).set({ endedAt: new Date().toISOString(), scorePct: pct === null ? null : Math.round(pct * 10) / 10 }).where(eq(sessions.id, sessionId));
}

export async function sessionAttempts(sessionId: number) {
  return db
    .select({
      id: attempts.id,
      questionId: attempts.questionId,
      isCorrect: attempts.isCorrect,
      family: attempts.distractorFamily,
      seconds: attempts.secondsSpent,
      pretest: attempts.pretest,
      chosen: attempts.chosenOptionIdsJson,
      domain: questions.domain,
      syllabusItemId: questions.syllabusItemId,
      itemType: questions.itemType,
      stem: questions.stem,
    })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(eq(attempts.sessionId, sessionId))
    .orderBy(asc(attempts.id));
}

export async function recentSessions(kind?: "practice" | "mock", limit = 10) {
  const examId = await getExamId();
  return db
    .select()
    .from(sessions)
    .where(and(eq(sessions.examId, examId), kind ? eq(sessions.kind, kind) : notInArray(sessions.kind, ["lesson", "flashcards"])))
    .orderBy(desc(sessions.startedAt))
    .limit(limit);
}
