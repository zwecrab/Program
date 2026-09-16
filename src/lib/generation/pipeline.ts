/**
 * Orchestration: generate → deterministic QA → adversarial QA → revise once →
 * activate or quarantine. Used by scripts/generate-questions.ts, the admin
 * "generate" action, and the top-up queue.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { generationRuns, type SyllabusItem } from "@/db/schema";
import { getEcoTask, getExamId } from "@/db/queries";
import type { RetrievedChunk } from "@/lib/retrieval";
import { existingStems, generateBatch, insertGenerated, planQuestions, retrieveForQuestions, type GeneratedQuestion } from "./questions";
import {
  adversarialReview,
  balancePositions,
  batchBiasReport,
  deterministicChecks,
  loadBankStems,
  loadSourceTexts,
  replaceQuestion,
  reviseQuestion,
  setQaResult,
  type QaRecord,
} from "./qa";
import { citedChunks, computeSupport } from "./support";

export interface PipelineOptions {
  count: number;
  difficulty: 1 | 2 | 3 | null;
  batchSize?: number;
  runId?: number | null;
  ignoreCap?: boolean;
  log?: (line: string) => void;
  seed?: number;
}

export interface PipelineResult {
  runId: number;
  requested: number;
  generated: number;
  active: number;
  quarantined: number;
  failed: number;
  costUsd: number;
  ids: number[];
  batchBias: ReturnType<typeof batchBiasReport>;
}

export async function startRun(kind: "questions" | "lesson" | "topup" | "qa" | "coaching", syllabusItemId: number | null, params: unknown): Promise<number> {
  const examId = await getExamId();
  const [run] = await db
    .insert(generationRuns)
    .values({ examId, kind, syllabusItemId, status: "running", startedAt: new Date().toISOString(), paramsJson: JSON.stringify(params) })
    .returning({ id: generationRuns.id });
  return run.id;
}

export async function finishRun(runId: number, patch: Partial<{ status: "done" | "failed"; requested: number; produced: number; passed: number; costUsd: number; log: string }>) {
  await db
    .update(generationRuns)
    .set({ ...patch, endedAt: new Date().toISOString() })
    .where(eq(generationRuns.id, runId));
}

/** QA one generated question that is already inserted. Mutates DB status; returns the record. */
export async function qaOne(
  questionId: number,
  g: GeneratedQuestion,
  item: SyllabusItem,
  chunks: RetrievedChunk[],
  ctx: { bankStems: Array<{ id: number; stem: string }>; sourceTexts: string[] },
  opts: { runId?: number | null; ignoreCap?: boolean },
): Promise<{ record: QaRecord; costUsd: number }> {
  let cost = 0;
  let current = g.input;
  let cites = g.cites;
  let det = deterministicChecks(current, ctx);
  let review = null as QaRecord["review"];
  let revised = false;

  const runReview = async () => {
    const r = await adversarialReview(current, item, chunks, opts);
    cost += r.costUsd;
    return r.verdict;
  };

  if (det.ok) review = await runReview();

  const needsRevise = !det.ok || review?.verdict === "revise";
  if (needsRevise && review?.verdict !== "reject") {
    const problems = [...det.problems, ...(review?.reasons ?? []), review?.fix_hint ?? ""].filter(Boolean);
    const rev = await reviseQuestion(current, problems, opts);
    cost += rev.costUsd;
    if (rev.question) {
      revised = true;
      current = rev.question;
      cites = rev.cites.length ? rev.cites : cites;
      det = deterministicChecks(current, ctx);
      if (det.ok) review = await runReview();
    }
  }

  const final: QaRecord["final"] = det.ok && review?.verdict === "pass" ? "active" : review?.verdict === "reject" ? "quarantined" : det.ok ? "quarantined" : "failed";
  const record: QaRecord = { deterministic: det, review, revised, final, checkedAt: new Date().toISOString() };

  if (revised) {
    const sup = computeSupport(citedChunks(cites, chunks), review?.grounded === false ? "no" : g.support.is_grounded);
    await replaceQuestion(questionId, current, { citationsJson: JSON.stringify(sup.citations), support: sup.support });
  }
  await setQaResult(questionId, record);
  return { record, costUsd: cost };
}

export async function generateQuestionsForItem(syllabusItemId: number, o: PipelineOptions): Promise<PipelineResult> {
  const item = await getEcoTask(syllabusItemId);
  if (!item) throw new Error(`syllabus item ${syllabusItemId} not found`);
  const log = o.log ?? (() => {});
  const runId = o.runId ?? (await startRun("questions", syllabusItemId, { count: o.count, difficulty: o.difficulty }));
  const batchSize = o.batchSize ?? 5;
  const batch = `run-${runId}`;
  let cost = 0;
  const ids: number[] = [];
  let active = 0;
  let quarantined = 0;
  let failed = 0;
  let generated = 0;
  const allInputs = [];

  try {
    const plan = planQuestions(o.count, o.difficulty, o.seed ?? runId);
    const sourceTexts = await loadSourceTexts();
    if (!sourceTexts.length) throw new Error("No source chunks indexed. Run npm run extract:sources && npm run index:sources first.");
    const focusList = ["planning and identifying", "analysis and prioritisation", "responses, owners and triggers", "monitoring, triggers and issues", "adaptive and hybrid practice", "artifacts and approvals"];

    for (let i = 0; i < plan.length; i += batchSize) {
      const slice = plan.slice(i, i + batchSize);
      const chunks = await retrieveForQuestions(item, focusList[(i / batchSize) % focusList.length]);
      if (!chunks.length) throw new Error("retrieval returned no chunks for this task");
      const avoid = await existingStems(item.id);
      const gen = await generateBatch(item, slice, chunks, { runId, ignoreCap: o.ignoreCap, avoid: avoid.slice(-40) });
      cost += gen.costUsd;
      failed += gen.failed.length;
      for (const f of gen.failed) log(`  ✗ schema: ${f.errors.slice(0, 3).join("; ")}`);

      const balanced = balancePositions(gen.questions.map((g) => g.input));
      gen.questions.forEach((g, k) => (g.input = balanced[k]));

      for (const g of gen.questions) {
        generated++;
        const id = await insertGenerated(g, batch);
        ids.push(id);
        const bankStems = await loadBankStems(item.id, id);
        const { record, costUsd } = await qaOne(id, g, item, chunks, { bankStems, sourceTexts }, { runId, ignoreCap: o.ignoreCap });
        cost += costUsd;
        allInputs.push(g.input);
        if (record.final === "active") active++;
        else if (record.final === "quarantined") quarantined++;
        else failed++;
        log(`  ${record.final === "active" ? "✓" : record.final === "quarantined" ? "?" : "✗"} #${id} ${g.input.item_type.padEnd(17)} d${g.input.difficulty} ${g.input.style.padEnd(18)} ${record.final}${record.revised ? " (revised)" : ""}${record.review?.reasons?.length && record.final !== "active" ? " — " + record.review.reasons[0].slice(0, 90) : ""}`);
      }
      log(`  batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(plan.length / batchSize)} done · $${cost.toFixed(4)} so far`);
    }

    const batchBias = batchBiasReport(allInputs);
    for (const p of batchBias.problems) log(`  ! batch bias: ${p}`);
    await finishRun(runId, { status: "done", requested: o.count, produced: generated, passed: active, costUsd: cost, log: `${active} active, ${quarantined} quarantined, ${failed} failed` });
    return { runId, requested: o.count, generated, active, quarantined, failed, costUsd: cost, ids, batchBias };
  } catch (err) {
    await finishRun(runId, { status: "failed", requested: o.count, produced: generated, passed: active, costUsd: cost, log: String(err instanceof Error ? err.message : err).slice(0, 2000) });
    throw err;
  }
}
