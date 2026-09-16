/**
 * Question QA (build prompt §7). Deterministic checks first, then an
 * adversarial LLM reviewer. Nothing reaches `active` without passing both.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { options, questions, sourceChunks, type SyllabusItem } from "@/db/schema";
import { chat } from "@/lib/llm";
import { containsAbsolute, questionInputSchema, type QuestionInput } from "@/lib/question-schema";
import { longestSharedRun } from "@/lib/chunking";
import type { RetrievedChunk } from "@/lib/retrieval";
import { qaReviewSystemPrompt, qaReviewUserPrompt, reviseUserPrompt } from "./prompts";
import { getExamId } from "@/db/queries";

export interface DeterministicReport {
  ok: boolean;
  problems: string[];
  longestSourceRun: number;
  nearDuplicateOf: number | null;
}

export interface ReviewVerdict {
  verdict: "pass" | "revise" | "reject";
  second_answer: boolean;
  stem_leaks: boolean;
  needs_unstated_fact: boolean;
  task_matches: boolean;
  verb_consistent: boolean;
  families_correct: boolean;
  grounded: boolean;
  reasons: string[];
  fix_hint: string;
}

export interface QaRecord {
  deterministic: DeterministicReport;
  review: ReviewVerdict | null;
  revised: boolean;
  final: "active" | "quarantined" | "failed";
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Deterministic
// ---------------------------------------------------------------------------

export function trigrams(text: string): Set<string> {
  const t = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  for (let i = 0; i + 3 <= t.length; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function trigramSimilarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  return inter / (ta.size + tb.size - inter);
}

/** Checks that need only the question itself plus the existing bank. */
export function deterministicChecks(
  q: QuestionInput,
  ctx: { bankStems: Array<{ id: number; stem: string }>; sourceTexts: string[] },
): DeterministicReport {
  const problems: string[] = [];

  // Structural rules are enforced by the zod schema; re-run so a hand-edited question is checked too.
  const v = questionInputSchema.safeParse(q);
  if (!v.success) problems.push(...v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));

  if (q.options.length) {
    const correct = q.options.filter((o) => o.is_correct);
    const wrong = q.options.filter((o) => !o.is_correct);
    const correctHasAbsolute = correct.some((o) => containsAbsolute(o.body));
    if (!correctHasAbsolute && wrong.some((o) => containsAbsolute(o.body))) {
      problems.push("a wrong option uses an absolute (always/never/all/none/only) while the correct one does not — that leaks the answer");
    }
    // Stem echo: a wrong option should not be a near-verbatim lift of the stem's final clause.
    const lastClause = q.stem.split(/[.?!]/).filter(Boolean).slice(-1)[0] ?? "";
    for (const o of correct) if (lastClause && trigramSimilarity(o.body, lastClause) > 0.6) problems.push("the correct option echoes the stem's wording");
  }

  let nearDuplicateOf: number | null = null;
  for (const b of ctx.bankStems) {
    if (trigramSimilarity(q.stem, b.stem) > 0.85) {
      nearDuplicateOf = b.id;
      problems.push(`near-duplicate of question #${b.id}`);
      break;
    }
  }

  let longestSourceRun = 0;
  const texts = [q.stem, q.explanation_md, ...q.options.map((o) => `${o.body} ${o.rationale}`)];
  for (const src of ctx.sourceTexts) for (const t of texts) longestSourceRun = Math.max(longestSourceRun, longestSharedRun(t, src));
  if (longestSourceRun >= 25) problems.push(`reproduces a ${longestSourceRun}-word run from the source material (limit 25)`);

  return { ok: problems.length === 0, problems, longestSourceRun, nearDuplicateOf };
}

/** Batch-level bias checks across a set of option-based questions (position ≤35%, longest-correct ≤30%). */
export function batchBiasReport(qs: QuestionInput[]): { problems: string[]; positionShare: Record<string, number>; longestCorrectShare: number } {
  const withOptions = qs.filter((q) => q.options.length && q.item_type !== "multi");
  const pos = new Map<string, number>();
  let longest = 0;
  for (const q of withOptions) {
    const c = q.options.find((o) => o.is_correct);
    if (!c) continue;
    pos.set(c.label, (pos.get(c.label) ?? 0) + 1);
    if (q.options.every((o) => o.body.length <= c.body.length)) longest++;
  }
  const n = withOptions.length || 1;
  const positionShare = Object.fromEntries([...pos.entries()].map(([k, v]) => [k, v / n]));
  const longestCorrectShare = longest / n;
  const problems: string[] = [];
  if (withOptions.length >= 10) {
    for (const [label, share] of Object.entries(positionShare)) if (share > 0.35) problems.push(`correct answer sits at ${label} in ${(share * 100).toFixed(0)}% of the batch (limit 35%)`);
    if (longestCorrectShare > 0.3) problems.push(`correct option is the longest in ${(longestCorrectShare * 100).toFixed(0)}% of the batch (limit 30%)`);
  }
  return { problems, positionShare, longestCorrectShare };
}

/** Rotate the correct option to a target position (labels stay A–D in order). */
export function rotateCorrectTo(q: QuestionInput, targetIndex: number): QuestionInput {
  if (!q.options.length || q.item_type === "multi") return q;
  const ci = q.options.findIndex((o) => o.is_correct);
  if (ci < 0 || ci === targetIndex) return q;
  const opts = [...q.options];
  const [c] = opts.splice(ci, 1);
  opts.splice(targetIndex, 0, c);
  return { ...q, options: opts.map((o, i) => ({ ...o, label: String.fromCharCode(65 + i) })) };
}

/** Spread correct positions evenly across a batch before insert. */
export function balancePositions(qs: QuestionInput[]): QuestionInput[] {
  let i = 0;
  return qs.map((q) => {
    if (!q.options.length || q.item_type === "multi") return q;
    const target = i++ % q.options.length;
    return rotateCorrectTo(q, target);
  });
}

export async function loadBankStems(itemId: number, excludeId?: number) {
  const rows = await db
    .select({ id: questions.id, stem: questions.stem })
    .from(questions)
    .where(and(eq(questions.syllabusItemId, itemId), inArray(questions.status, ["active", "qa_pending"]), excludeId ? ne(questions.id, excludeId) : undefined));
  return rows;
}

export async function loadSourceTexts(): Promise<string[]> {
  return (await db.select({ text: sourceChunks.text }).from(sourceChunks)).map((r) => r.text);
}

// ---------------------------------------------------------------------------
// Adversarial review
// ---------------------------------------------------------------------------

export async function adversarialReview(
  q: QuestionInput,
  item: SyllabusItem,
  chunks: RetrievedChunk[],
  opts: { runId?: number | null; ignoreCap?: boolean } = {},
): Promise<{ verdict: ReviewVerdict; costUsd: number }> {
  const examId = await getExamId();
  const res = await chat<Partial<ReviewVerdict>>({
    purpose: "qa_review",
    system: qaReviewSystemPrompt(),
    user: qaReviewUserPrompt(q, item, chunks),
    json: true,
    temperature: 0.2,
    maxTokens: 900,
    runId: opts.runId,
    examId,
    ignoreCap: opts.ignoreCap,
  });
  const j = res.json ?? {};
  const verdict: ReviewVerdict = {
    verdict: j.verdict === "pass" || j.verdict === "revise" || j.verdict === "reject" ? j.verdict : "revise",
    second_answer: !!j.second_answer,
    stem_leaks: !!j.stem_leaks,
    needs_unstated_fact: !!j.needs_unstated_fact,
    task_matches: j.task_matches !== false,
    verb_consistent: j.verb_consistent !== false,
    families_correct: j.families_correct !== false,
    grounded: j.grounded !== false,
    reasons: Array.isArray(j.reasons) ? j.reasons.map(String) : [],
    fix_hint: typeof j.fix_hint === "string" ? j.fix_hint : "",
  };
  // Hard rules override a lenient reviewer.
  if (verdict.second_answer || !verdict.task_matches) verdict.verdict = "reject";
  else if ((verdict.needs_unstated_fact || verdict.stem_leaks || !verdict.verb_consistent || !verdict.families_correct || !verdict.grounded) && verdict.verdict === "pass") verdict.verdict = "revise";
  return { verdict, costUsd: res.costUsd };
}

export async function reviseQuestion(
  q: QuestionInput,
  problems: string[],
  opts: { runId?: number | null; ignoreCap?: boolean } = {},
): Promise<{ question: QuestionInput | null; cites: number[]; costUsd: number }> {
  const examId = await getExamId();
  const res = await chat<{ question?: Record<string, unknown> }>({
    purpose: "question_revise",
    system: (await import("./prompts")).questionSystemPrompt(),
    user: reviseUserPrompt(q, problems),
    json: true,
    maxTokens: 3000,
    runId: opts.runId,
    examId,
    ignoreCap: opts.ignoreCap,
  });
  const raw = res.json?.question;
  if (!raw) return { question: null, cites: [], costUsd: res.costUsd };
  const v = questionInputSchema.safeParse({
    ...raw,
    syllabus_item_id: q.syllabus_item_id,
    domain: q.domain,
    item_type: q.item_type,
    delivery_approach: q.delivery_approach,
    difficulty: q.difficulty,
    style: q.style,
    options: Array.isArray(raw.options) ? raw.options : [],
    exhibit: raw.exhibit ?? null,
    pmbok_ref: typeof raw.pmbok_ref === "string" ? raw.pmbok_ref : q.pmbok_ref,
    explanation_md: typeof raw.explanation_md === "string" ? raw.explanation_md : q.explanation_md,
  });
  const cites = Array.isArray(raw.cites) ? (raw.cites as unknown[]).map(Number).filter(Number.isInteger) : [];
  return { question: v.success ? v.data : null, cites, costUsd: res.costUsd };
}

/** Load a stored question back into the QuestionInput shape (for admin edits and re-QA). */
export async function loadQuestionInput(questionId: number): Promise<QuestionInput | null> {
  const [q] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!q) return null;
  const opts = await db.select().from(options).where(eq(options.questionId, questionId)).orderBy(options.label);
  const raw = {
    syllabus_item_id: q.syllabusItemId,
    domain: q.domain,
    delivery_approach: q.deliveryApproach,
    item_type: q.itemType,
    difficulty: q.difficulty,
    style: q.style,
    stem: q.stem,
    exhibit: q.exhibitJson ? JSON.parse(q.exhibitJson) : null,
    explanation_md: q.explanationMd,
    pmbok_ref: q.pmbokRef,
    options: opts.map((o) => ({ label: o.label, body: o.body, is_correct: o.isCorrect, distractor_family: o.distractorFamily, rationale: o.rationale })),
  };
  const v = questionInputSchema.safeParse(raw);
  return v.success ? v.data : (raw as unknown as QuestionInput);
}

/** Overwrite a stored question (and its options) from a QuestionInput. */
export async function replaceQuestion(questionId: number, q: QuestionInput, patch: Partial<{ citationsJson: string | null; support: "high" | "medium" | "low" | null }> = {}) {
  await db
    .update(questions)
    .set({
      stem: q.stem,
      exhibitJson: q.exhibit ? JSON.stringify(q.exhibit) : null,
      explanationMd: q.explanation_md,
      pmbokRef: q.pmbok_ref ?? null,
      deliveryApproach: q.delivery_approach,
      itemType: q.item_type,
      difficulty: q.difficulty,
      style: q.style,
      ...patch,
    })
    .where(eq(questions.id, questionId));
  await db.delete(options).where(eq(options.questionId, questionId));
  if (q.options.length) {
    await db.insert(options).values(
      q.options.map((o) => ({
        questionId,
        label: o.label.toUpperCase(),
        body: o.body,
        isCorrect: o.is_correct,
        distractorFamily: o.distractor_family ?? null,
        rationale: o.rationale,
      })),
    );
  }
}

export async function setQaResult(questionId: number, record: QaRecord) {
  await db.update(questions).set({ qaJson: JSON.stringify(record), status: record.final }).where(eq(questions.id, questionId));
}
