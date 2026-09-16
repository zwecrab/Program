"use server";

import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { createMock, endBreak, lockCaseBlock, saveAnswer, setIndex, submitExam, takeSecondBreak, toggleFlag } from "@/lib/exam";
import type { Chosen } from "@/lib/scoring";

async function guard() {
  if (!(await isAuthenticated())) throw new Error("unauthenticated");
}

export async function startMock() {
  await guard();
  const { id } = await createMock();
  redirect(`/exam/${id}`);
}

export async function examSaveAnswer(id: number, questionId: number, chosen: Chosen, secondsDelta: number) {
  await guard();
  return saveAnswer(id, questionId, chosen, secondsDelta);
}
export async function examToggleFlag(id: number, questionId: number) {
  await guard();
  await toggleFlag(id, questionId);
}
export async function examSetIndex(id: number, index: number) {
  await guard();
  await setIndex(id, index);
}
export async function examLockCase(id: number, takeBreak: boolean) {
  await guard();
  await lockCaseBlock(id, takeBreak);
}
export async function examSecondBreak(id: number) {
  await guard();
  await takeSecondBreak(id);
}
export async function examEndBreak(id: number) {
  await guard();
  await endBreak(id);
}
export async function examSubmit(id: number) {
  await guard();
  await submitExam(id, "user");
  redirect(`/exam/${id}/results`);
}
