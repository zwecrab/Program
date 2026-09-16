"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reviewItems } from "@/db/schema";
import { getExamId } from "@/db/queries";
import { isAuthenticated } from "@/lib/session";
import { createPracticeSession, loadQuestion, recordAnswer, type PracticeConfig } from "@/lib/sessions";
import { correctKey, type Chosen } from "@/lib/scoring";
import type { Citation } from "@/lib/retrieval";
import { PMP } from "../../config/exams/pmp";

async function guard() {
  if (!(await isAuthenticated())) throw new Error("unauthenticated");
}

export async function startPractice(formData: FormData) {
  await guard();
  const cfg: PracticeConfig = {
    mode: (String(formData.get("mode")) as PracticeConfig["mode"]) || "mixed",
    taskId: Number(formData.get("taskId")) || null,
    domain: String(formData.get("domain") || "") || null,
    count: Math.min(60, Math.max(5, Number(formData.get("count")) || 20)),
    timed: formData.get("timed") === "on",
  };
  const { id } = await createPracticeSession(cfg);
  redirect(`/session/${id}`);
}

export interface ReviewPayload {
  isCorrect: boolean;
  family: string | null;
  familyLabel: string | null;
  rule: string | null;
  parts?: Array<{ id: string; correct: boolean }>;
  correctKey: string;
  options: Array<{ id: number; label: string; body: string; isCorrect: boolean; family: string | null; rationale: string }>;
  exhibitRationales: Array<{ label: string; correct: boolean; family: string | null; rationale: string }>;
  explanationMd: string;
  pmbokRef: string | null;
  citations: Citation[];
  support: "high" | "medium" | "low" | null;
  done: boolean;
  questionId: number;
}

export async function submitAnswer(sessionId: number, questionId: number, chosen: Chosen, secondsSpent: number | null, confidence: number | null): Promise<ReviewPayload> {
  await guard();
  const r = await recordAnswer(sessionId, questionId, chosen, secondsSpent, confidence);
  const lq = await loadQuestion(questionId);
  if (!lq) throw new Error("question not found");
  const ex = lq.exhibit;
  const exhibitRationales: ReviewPayload["exhibitRationales"] = [];
  if (ex && (ex.kind === "matching" || ex.kind === "enhanced_matching")) {
    for (const a of ex.answer) exhibitRationales.push({ label: `${ex.left.find((l) => l.id === a.left)?.text} → ${ex.right.find((x) => x.id === a.right)?.text}`, correct: true, family: null, rationale: ex.rationales[a.left] ?? "" });
    for (const rgt of ex.right.filter((x) => !ex.answer.some((a) => a.right === x.id))) exhibitRationales.push({ label: rgt.text, correct: false, family: rgt.distractor_family ?? null, rationale: rgt.rationale ?? "" });
  } else if (ex && ex.kind === "point_and_click") {
    for (const rg of ex.regions) exhibitRationales.push({ label: rg.label, correct: rg.is_correct, family: rg.distractor_family ?? null, rationale: rg.rationale });
  } else if (ex && ex.kind === "pull_down_list") {
    for (const b of ex.blanks) for (const c of b.choices) exhibitRationales.push({ label: `${b.id}: ${c.text}`, correct: c.is_correct, family: c.distractor_family ?? null, rationale: c.rationale });
  }
  const fr = r.family ? PMP.familyRules[r.family] : null;
  return {
    isCorrect: r.isCorrect,
    family: r.family,
    familyLabel: fr?.label ?? null,
    rule: fr?.rule ?? null,
    parts: r.parts,
    correctKey: correctKey(lq.question.itemType, lq.options, ex),
    options: lq.options.map((o) => ({ id: o.id, label: o.label, body: o.body, isCorrect: o.isCorrect, family: o.distractorFamily, rationale: o.rationale })),
    exhibitRationales,
    explanationMd: lq.question.explanationMd,
    pmbokRef: lq.question.pmbokRef,
    citations: lq.question.citationsJson ? JSON.parse(lq.question.citationsJson) : [],
    support: lq.question.support,
    done: r.done,
    questionId,
  };
}

export async function addReviewItem(questionId: number, family: string | null, note: string) {
  await guard();
  const examId = await getExamId();
  const rule = family ? PMP.familyRules[family]?.rule ?? null : null;
  await db.insert(reviewItems).values({ examId, questionId, distractorFamily: family, ruleBroken: rule, note: note || null });
  revalidatePath("/errors");
  revalidatePath("/");
}

export async function resolveReviewItem(id: number, resolved: boolean) {
  await guard();
  await db.update(reviewItems).set({ resolved }).where(eq(reviewItems.id, id));
  revalidatePath("/errors");
  revalidatePath("/");
}
