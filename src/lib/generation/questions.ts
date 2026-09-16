import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { options, questions, type SyllabusItem, ITEM_TYPES, STYLES, DELIVERY_APPROACHES } from "@/db/schema";
import { getEcoTask, getExamId } from "@/db/queries";
import { chat } from "@/lib/llm";
import { retrieve, type RetrievedChunk } from "@/lib/retrieval";
import { questionInputSchema, type QuestionInput } from "@/lib/question-schema";
import { questionSystemPrompt, questionUserPrompt, type QuestionPlanEntry } from "./prompts";
import { checkGrounding, citedChunks, computeSupport, type SupportResult } from "./support";
import { PMP } from "../../../config/exams/pmp";

export interface GeneratedQuestion {
  input: QuestionInput;
  cites: number[];
  support: SupportResult;
  raw: unknown;
}

/** Deterministic-ish plan matching the bank composition targets (build prompt §6.5). */
export function planQuestions(count: number, difficulty: 1 | 2 | 3 | null, seed = 1): QuestionPlanEntry[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T extends string>(mix: Record<T, number>): T => {
    const r = rnd();
    let acc = 0;
    const entries = Object.entries(mix) as Array<[T, number]>;
    for (const [k, w] of entries) {
      acc += w;
      if (r <= acc) return k;
    }
    return entries[entries.length - 1][0];
  };
  const styles: Record<(typeof STYLES)[number], number> = { what_should_pm_do: 0.3, first: 0.2, next: 0.15, best: 0.15, concept: 0.12, calculation: 0.08 };
  const out: QuestionPlanEntry[] = [];
  for (let i = 0; i < count; i++) {
    const item_type = pick(PMP.bank.itemTypeMix as Record<(typeof ITEM_TYPES)[number], number>);
    let style = pick(styles);
    if (style === "calculation" && item_type !== "single" && item_type !== "multi") style = "concept";
    out.push({
      item_type,
      delivery_approach: pick(PMP.bank.deliveryMix as Record<(typeof DELIVERY_APPROACHES)[number], number>),
      difficulty: difficulty ?? (pick({ "1": PMP.bank.difficultyMix[1], "2": PMP.bank.difficultyMix[2], "3": PMP.bank.difficultyMix[3] }) === "1" ? 1 : rnd() < 0.67 ? 2 : 3),
      style,
    });
  }
  return out;
}

export async function retrieveForQuestions(item: SyllabusItem, focus?: string): Promise<RetrievedChunk[]> {
  const q = focus ? `${item.title}: ${focus}` : `${item.title} — how a project manager performs this task, decisions, artifacts, common errors`;
  return retrieve(q, { syllabusItemId: item.id });
}

export async function existingStems(itemId: number): Promise<string[]> {
  const rows = await db
    .select({ stem: questions.stem })
    .from(questions)
    .where(and(eq(questions.syllabusItemId, itemId), inArray(questions.status, ["active", "qa_pending"])));
  return rows.map((r) => r.stem);
}

/**
 * One generation call for a batch of planned questions. Invalid items are
 * retried (whole batch re-asked with the validation errors) up to 2 times;
 * survivors that still fail are dropped and reported.
 */
export async function generateBatch(
  item: SyllabusItem,
  plan: QuestionPlanEntry[],
  chunks: RetrievedChunk[],
  opts: { runId?: number | null; ignoreCap?: boolean; avoid?: string[] } = {},
): Promise<{ questions: GeneratedQuestion[]; failed: Array<{ raw: unknown; errors: string[] }>; costUsd: number }> {
  const examId = await getExamId();
  let cost = 0;
  const good: GeneratedQuestion[] = [];
  let failed: Array<{ raw: unknown; errors: string[] }> = [];
  let pending = plan;
  let feedback = "";

  for (let attempt = 0; attempt < 3 && pending.length; attempt++) {
    const res = await chat<{ questions?: unknown[] }>({
      purpose: "questions",
      system: questionSystemPrompt(),
      user: questionUserPrompt(item, chunks, pending, opts.avoid ?? []) + (feedback ? `\n\nPrevious attempt had these validation errors — fix them:\n${feedback}` : ""),
      json: true,
      maxTokens: 7000,
      runId: opts.runId,
      examId,
      ignoreCap: opts.ignoreCap,
    });
    cost += res.costUsd;
    const arr = Array.isArray(res.json?.questions) ? res.json!.questions! : [];
    failed = [];
    const nextPending: QuestionPlanEntry[] = [];
    const errs: string[] = [];
    pending.forEach((p, i) => {
      const raw = arr[i] as Record<string, unknown> | undefined;
      if (!raw) {
        nextPending.push(p);
        errs.push(`question ${i + 1} missing`);
        return;
      }
      const candidate = {
        ...raw,
        syllabus_item_id: item.id,
        domain: item.domain,
        item_type: p.item_type,
        delivery_approach: p.delivery_approach,
        difficulty: p.difficulty,
        style: p.style,
        options: Array.isArray(raw.options) ? raw.options : [],
        exhibit: raw.exhibit ?? null,
        pmbok_ref: typeof raw.pmbok_ref === "string" ? raw.pmbok_ref : null,
        explanation_md: typeof raw.explanation_md === "string" ? raw.explanation_md : "",
      };
      const v = questionInputSchema.safeParse(candidate);
      if (v.success) {
        const cites = Array.isArray(raw.cites) ? (raw.cites as unknown[]).map(Number).filter(Number.isInteger) : [];
        good.push({ input: v.data, cites, raw, support: computeSupport(citedChunks(cites, chunks), "partly") });
      } else {
        const e = v.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`);
        nextPending.push(p);
        failed.push({ raw, errors: e });
        errs.push(`question ${i + 1} (${p.item_type}): ${e.join("; ")}`);
      }
    });
    pending = nextPending;
    feedback = errs.join("\n").slice(0, 2500);
  }

  // Grounding for the survivors: one call per batch.
  if (good.length) {
    const grounded = await checkGrounding(
      good.map((g) => ({
        claim: `${g.input.stem}\nCORRECT: ${describeCorrect(g.input)}\nWHY: ${g.input.explanation_md}`,
        cited: citedChunks(g.cites, chunks),
      })),
      { runId: opts.runId, examId, ignoreCap: opts.ignoreCap },
    );
    good.forEach((g, i) => (g.support = computeSupport(citedChunks(g.cites, chunks), grounded[i])));
  }
  return { questions: good, failed, costUsd: cost };
}

export function describeCorrect(q: QuestionInput): string {
  if (q.options.length) return q.options.filter((o) => o.is_correct).map((o) => `${o.label}. ${o.body}`).join(" | ");
  const ex = q.exhibit;
  if (!ex) return "";
  if (ex.kind === "matching" || ex.kind === "enhanced_matching") return ex.answer.map((a) => `${a.left}→${a.right}`).join(", ");
  if (ex.kind === "point_and_click") return ex.regions.filter((r) => r.is_correct).map((r) => r.label).join(", ");
  if (ex.kind === "pull_down_list") return ex.blanks.map((b) => `${b.id}=${b.choices.find((c) => c.is_correct)?.text}`).join(", ");
  return "";
}

/** Persist a generated question with qa_pending status. Returns its id. */
export async function insertGenerated(g: GeneratedQuestion, batch: string): Promise<number> {
  const examId = await getExamId();
  const q = g.input;
  const [row] = await db
    .insert(questions)
    .values({
      examId,
      syllabusItemId: q.syllabus_item_id,
      domain: q.domain,
      deliveryApproach: q.delivery_approach,
      itemType: q.item_type,
      difficulty: q.difficulty,
      style: q.style,
      stem: q.stem,
      exhibitJson: q.exhibit ? JSON.stringify(q.exhibit) : null,
      explanationMd: q.explanation_md,
      pmbokRef: q.pmbok_ref ?? null,
      citationsJson: JSON.stringify(g.support.citations),
      support: g.support.support,
      sourceBatch: batch,
      status: "qa_pending",
    })
    .returning({ id: questions.id });
  if (q.options.length) {
    await db.insert(options).values(
      q.options.map((o) => ({
        questionId: row.id,
        label: o.label.toUpperCase(),
        body: o.body,
        isCorrect: o.is_correct,
        distractorFamily: o.distractor_family ?? null,
        rationale: o.rationale,
      })),
    );
  }
  return row.id;
}

export { getEcoTask };
