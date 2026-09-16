"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { syllabusItems, studyDays } from "@/db/schema";
import { isAuthenticated } from "@/lib/session";

async function guard() {
  if (!(await isAuthenticated())) throw new Error("unauthenticated");
}

export async function toggleStudyDay(day: number, done: boolean) {
  await guard();
  await db.update(studyDays).set({ done }).where(eq(studyDays.day, day));
  revalidatePath("/plan");
  revalidatePath("/");
}

export async function setStudyDayNotes(day: number, hours: number | null, notes: string) {
  await guard();
  await db.update(studyDays).set({ hours, notes }).where(eq(studyDays.day, day));
  revalidatePath("/plan");
}

export async function toggleTaskStudied(taskId: number, studied: boolean) {
  await guard();
  await db
    .update(syllabusItems)
    .set({ studied, studiedAt: studied ? new Date().toISOString() : null })
    .where(eq(syllabusItems.id, taskId));
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath(`/lesson/${taskId}`);
}

export async function setLessonReviewed(lessonId: number, reviewed: boolean) {
  await guard();
  const { lessons } = await import("@/db/schema");
  await db.update(lessons).set({ reviewed }).where(eq(lessons.id, lessonId));
  revalidatePath("/lesson/[id]", "page");
}

export async function setLocale(locale: "en" | "my") {
  await guard();
  const { setSetting } = await import("@/lib/settings");
  await setSetting("locale", locale);
  revalidatePath("/", "layout");
}
