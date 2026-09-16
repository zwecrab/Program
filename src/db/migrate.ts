import { migrate } from "drizzle-orm/libsql/migrator";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { db } from "./client";
import { ecoTasks, sessions, settings, studyDays } from "./schema";
import { BASELINE_SESSION, DEFAULT_SETTINGS, ECO_TASKS, buildStudyDays, taskWeightPct } from "./seed-data";

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

export async function seed() {
  const existingTasks = await db.select({ id: ecoTasks.id }).from(ecoTasks);
  if (existingTasks.length === 0) {
    await db.insert(ecoTasks).values(
      ECO_TASKS.map((t) => ({
        id: t.id,
        domain: t.domain,
        taskNumber: t.taskNumber,
        title: t.title,
        weightPct: taskWeightPct(t.domain),
        planDay: t.planDay,
      })),
    );
  }

  const existingDays = await db.select({ day: studyDays.day }).from(studyDays);
  if (existingDays.length === 0) {
    await db.insert(studyDays).values(buildStudyDays());
  }

  const baseline = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.kind, "mini")).limit(1);
  if (baseline.length === 0) {
    await db.insert(sessions).values(BASELINE_SESSION);
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await db.insert(settings).values({ key, value }).onConflictDoNothing();
  }
}
