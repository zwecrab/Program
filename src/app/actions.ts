"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { ecoTasks, studyDays } from "@/db/schema";
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
    .update(ecoTasks)
    .set({ studied, studiedAt: studied ? new Date().toISOString() : null })
    .where(eq(ecoTasks.id, taskId));
  revalidatePath("/");
  revalidatePath("/plan");
  revalidatePath(`/lesson/${taskId}`);
}
