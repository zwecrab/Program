"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { flashcards } from "@/db/schema";
import { isAuthenticated } from "@/lib/session";
import { schedule, type GradeName } from "@/lib/fsrs";

export async function gradeFlashcard(id: number, grade: GradeName) {
  if (!(await isAuthenticated())) throw new Error("unauthenticated");
  const [card] = await db.select().from(flashcards).where(eq(flashcards.id, id)).limit(1);
  if (!card) return;
  const next = schedule(card, grade);
  await db.update(flashcards).set(next).where(eq(flashcards.id, id));
  revalidatePath("/flashcards");
  revalidatePath("/");
}
