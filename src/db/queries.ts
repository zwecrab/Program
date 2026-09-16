import { and, asc, count, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { ecoTasks, questions, studyDays, sessions, reviewItems, flashcards, lessons } from "./schema";

export async function getStudyDays() {
  return db.select().from(studyDays).orderBy(asc(studyDays.day));
}

export async function getStudyDay(day: number) {
  const rows = await db.select().from(studyDays).where(eq(studyDays.day, day)).limit(1);
  return rows[0] ?? null;
}

export async function getEcoTasks() {
  return db.select().from(ecoTasks).orderBy(asc(ecoTasks.domain), asc(ecoTasks.taskNumber));
}

export async function getTasksForDay(day: number) {
  return db.select().from(ecoTasks).where(eq(ecoTasks.planDay, day)).orderBy(asc(ecoTasks.taskNumber));
}

export async function getPlanProgress() {
  const [row] = await db
    .select({ total: count(), done: sql<number>`sum(case when ${studyDays.done} then 1 else 0 end)` })
    .from(studyDays);
  return { total: row?.total ?? 0, done: Number(row?.done ?? 0) };
}

export async function getTaskStudiedCount() {
  const [row] = await db
    .select({ total: count(), studied: sql<number>`sum(case when ${ecoTasks.studied} then 1 else 0 end)` })
    .from(ecoTasks);
  return { total: row?.total ?? 0, studied: Number(row?.studied ?? 0) };
}

export async function getBankCounts() {
  const rows = await db
    .select({ ecoTaskId: questions.ecoTaskId, status: questions.status, n: count() })
    .from(questions)
    .groupBy(questions.ecoTaskId, questions.status);
  return rows;
}

export async function getActiveQuestionCount() {
  const [row] = await db.select({ n: count() }).from(questions).where(eq(questions.status, "active"));
  return row?.n ?? 0;
}

export async function getLessonForTask(ecoTaskId: number) {
  const rows = await db.select().from(lessons).where(eq(lessons.ecoTaskId, ecoTaskId)).orderBy(sql`${lessons.version} desc`).limit(1);
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
