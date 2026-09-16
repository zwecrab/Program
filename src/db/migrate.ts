import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import { resolve } from "node:path";
import { db } from "./client";
import { exams, sessions, settings, studyDays, syllabusItems } from "./schema";
import { BASELINE_SESSION, DEFAULT_SETTINGS, DOMAIN_WEIGHTS, ECO_TASKS, buildStudyDays, taskWeightPct } from "./seed-data";
import { PMP } from "../../config/exams/pmp";

let done: Promise<void> | undefined;

/** Idempotent: safe to call on every boot. */
export function migrateAndSeed(): Promise<void> {
  if (!done) done = run();
  return done;
}

async function run() {
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  await seed();
}

/** Returns the active exam row id, creating the PMP row when missing. */
export async function ensureExam(): Promise<number> {
  const [row] = await db.select({ id: exams.id }).from(exams).where(eq(exams.code, PMP.code)).limit(1);
  if (row) return row.id;
  const [inserted] = await db
    .insert(exams)
    .values({
      code: PMP.code,
      title: PMP.title,
      examDate: PMP.examDate,
      questionCount: PMP.questionCount,
      minutes: PMP.minutes,
      domainWeightsJson: JSON.stringify(PMP.domainWeights),
    })
    .returning({ id: exams.id });
  return inserted.id;
}

export async function seed() {
  const examId = await ensureExam();

  const existingItems = await db.select({ id: syllabusItems.id }).from(syllabusItems).where(eq(syllabusItems.examId, examId));
  if (existingItems.length === 0) {
    await db.insert(syllabusItems).values(
      ECO_TASKS.map((t) => ({
        id: t.id,
        examId,
        code: t.code,
        domain: t.domain,
        taskNumber: t.taskNumber,
        title: t.title,
        weightPct: taskWeightPct(t.domain),
        planDay: t.planDay,
      })),
    );
  }
  // Idempotent repair: weight_pct is the domain weight (DECISIONS #12).
  for (const domain of Object.keys(DOMAIN_WEIGHTS) as Array<keyof typeof DOMAIN_WEIGHTS>) {
    await db
      .update(syllabusItems)
      .set({ weightPct: DOMAIN_WEIGHTS[domain] })
      .where(and(eq(syllabusItems.examId, examId), eq(syllabusItems.domain, domain)));
  }

  const existingDays = await db.select({ day: studyDays.day }).from(studyDays).where(eq(studyDays.examId, examId));
  if (existingDays.length === 0) {
    await db.insert(studyDays).values(buildStudyDays().map((d) => ({ ...d, examId })));
  }

  const baseline = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.examId, examId), eq(sessions.kind, "mini")))
    .limit(1);
  if (baseline.length === 0) {
    await db.insert(sessions).values({ ...BASELINE_SESSION, examId });
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }
}
