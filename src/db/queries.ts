import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { exams, flashcards, lessons, questions, reviewItems, sessions, studyDays, syllabusItems } from "./schema";
import { PMP } from "../../config/exams/pmp";

let cachedExamId: number | undefined;

/** The active exam's row id (PMP). Cached per process. */
export async function getExamId(): Promise<number> {
  if (cachedExamId) return cachedExamId;
  const [row] = await db.select({ id: exams.id }).from(exams).where(eq(exams.code, PMP.code)).limit(1);
  if (!row) throw new Error("exam row missing — run migrations");
  cachedExamId = row.id;
  return row.id;
}

export async function getStudyDays() {
  const examId = await getExamId();
  return db.select().from(studyDays).where(eq(studyDays.examId, examId)).orderBy(asc(studyDays.day));
}

export async function getStudyDay(day: number) {
  const examId = await getExamId();
  const rows = await db
    .select()
    .from(studyDays)
    .where(and(eq(studyDays.examId, examId), eq(studyDays.day, day)))
    .limit(1);
  return rows[0] ?? null;
}

/** All syllabus items (ECO tasks) for the active exam. */
export async function getEcoTasks() {
  const examId = await getExamId();
  return db.select().from(syllabusItems).where(eq(syllabusItems.examId, examId)).orderBy(asc(syllabusItems.domain), asc(syllabusItems.taskNumber));
}

export async function getEcoTask(id: number) {
  const [row] = await db.select().from(syllabusItems).where(eq(syllabusItems.id, id)).limit(1);
  return row ?? null;
}

export async function getTasksForDay(day: number) {
  const examId = await getExamId();
  return db
    .select()
    .from(syllabusItems)
    .where(and(eq(syllabusItems.examId, examId), eq(syllabusItems.planDay, day)))
    .orderBy(asc(syllabusItems.taskNumber));
}

export async function getPlanProgress() {
  const examId = await getExamId();
  const [row] = await db
    .select({ total: count(), done: sql<number>`sum(case when ${studyDays.done} then 1 else 0 end)` })
    .from(studyDays)
    .where(eq(studyDays.examId, examId));
  return { total: row?.total ?? 0, done: Number(row?.done ?? 0) };
}

export async function getTaskStudiedCount() {
  const examId = await getExamId();
  const [row] = await db
    .select({ total: count(), studied: sql<number>`sum(case when ${syllabusItems.studied} then 1 else 0 end)` })
    .from(syllabusItems)
    .where(eq(syllabusItems.examId, examId));
  return { total: row?.total ?? 0, studied: Number(row?.studied ?? 0) };
}

export async function getBankCounts() {
  return db
    .select({ syllabusItemId: questions.syllabusItemId, status: questions.status, n: count() })
    .from(questions)
    .groupBy(questions.syllabusItemId, questions.status);
}

export async function getActiveQuestionCount() {
  const [row] = await db.select({ n: count() }).from(questions).where(eq(questions.status, "active"));
  return row?.n ?? 0;
}

export async function getLessonForTask(syllabusItemId: number) {
  const rows = await db.select().from(lessons).where(eq(lessons.syllabusItemId, syllabusItemId)).orderBy(desc(lessons.version)).limit(1);
  return rows[0] ?? null;
}

export async function getDueFlashcardCount(nowIso: string) {
  const [row] = await db.select({ n: count() }).from(flashcards).where(sql`${flashcards.dueAt} <= ${nowIso}`);
  return row?.n ?? 0;
}

export async function getOpenReviewItemCount() {
  const [row] = await db.select({ n: count() }).from(reviewItems).where(eq(reviewItems.resolved, false));
  return row?.n ?? 0;
}

export async function getSessions() {
  return db.select().from(sessions).orderBy(asc(sessions.startedAt));
}

export async function getMockCount() {
  const [row] = await db
    .select({ n: count() })
    .from(sessions)
    .where(and(eq(sessions.kind, "mock"), sql`${sessions.endedAt} is not null`));
  return row?.n ?? 0;
}
