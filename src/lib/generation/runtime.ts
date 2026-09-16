/**
 * The runtime LLM features (build prompt §6.4) — the only LLM calls the app
 * makes while you study. Each respects the monthly cap.
 *
 * 1. explainDifferently(questionId) — one call, cached forever in `explanations`.
 * 2. enqueueTopUp(itemId) — when an item's unseen pool < 15, queue a run (processed by scripts/process-jobs.ts).
 * 3. weeklyCoaching() — one call per ISO week over attempt data.
 * Plus ask() — the lesson "ask a follow-up" box (Phase 2 acceptance tests 2–3).
 */
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, coachingSummaries, explanations, generationRuns, options, questions, syllabusItems } from "@/db/schema";
import { getExamId } from "@/db/queries";
import { chat } from "@/lib/llm";
import { retrieve, type Citation } from "@/lib/retrieval";
import { askSystemPrompt, coachingSystemPrompt, explainSystemPrompt } from "./prompts";
import { checkGrounding, citedChunks, computeSupport } from "./support";
import { formatContext } from "@/lib/retrieval";
import { PMP } from "../../../config/exams/pmp";
import type { SupportLevel } from "@/db/schema";

export interface GroundedAnswer {
  found: boolean;
  md: string;
  citations: Citation[];
  support: SupportLevel;
  costUsd: number;
}

const NOT_FOUND = "I could not find this in your materials.";

export async function ask(question: string, opts: { syllabusItemId?: number | null } = {}): Promise<GroundedAnswer> {
  const examId = await getExamId();
  const chunks = await retrieve(question, { syllabusItemId: opts.syllabusItemId ?? null });
  if (!chunks.length) return { found: false, md: NOT_FOUND, citations: [], support: "low", costUsd: 0 };

  const res = await chat<{ found?: boolean; md?: string; cites?: number[] }>({
    purpose: "ask",
    system: askSystemPrompt(),
    user: `SOURCE EXCERPTS:\n${formatContext(chunks)}\n\nQUESTION: ${question}`,
    json: true,
    maxTokens: 900,
    examId,
  });
  const j = res.json ?? {};
  const cited = citedChunks(j.cites, chunks);
  if (j.found === false || !j.md || cited.length === 0) return { found: false, md: NOT_FOUND, citations: [], support: "low", costUsd: res.costUsd };

  const [grounded] = await checkGrounding([{ claim: j.md, cited }], { examId });
  const sup = computeSupport(cited, grounded);
  if (grounded === "no") return { found: false, md: NOT_FOUND, citations: [], support: "low", costUsd: res.costUsd };
  return { found: true, md: j.md, citations: sup.citations, support: sup.support, costUsd: res.costUsd };
}

export async function explainDifferently(questionId: number): Promise<{ md: string; citations: Citation[]; support: SupportLevel; cached: boolean }> {
  const [hit] = await db.select().from(explanations).where(eq(explanations.questionId, questionId)).limit(1);
  if (hit) return { md: hit.bodyMd, citations: JSON.parse(hit.citationsJson ?? "[]"), support: hit.support ?? "medium", cached: true };

  const [q] = await db.select().from(questions).where(eq(questions.id, questionId)).limit(1);
  if (!q) throw new Error("question not found");
  const opts = await db.select().from(options).where(eq(options.questionId, questionId));
  const [item] = await db.select().from(syllabusItems).where(eq(syllabusItems.id, q.syllabusItemId)).limit(1);
  const examId = await getExamId();
  const chunks = await retrieve(`${item?.title ?? ""}: ${q.stem}`, { syllabusItemId: q.syllabusItemId });

  const res = await chat<{ md?: string; cites?: number[] }>({
    purpose: "explain",
    system: explainSystemPrompt(),
    user: [
      `SOURCE EXCERPTS:\n${formatContext(chunks)}`,
      `QUESTION: ${q.stem}`,
      opts.length ? `OPTIONS:\n${opts.map((o) => `${o.label}. ${o.body} ${o.isCorrect ? "(correct)" : `(wrong — ${o.distractorFamily})`}`).join("\n")}` : `EXHIBIT: ${q.exhibitJson}`,
      `ORIGINAL EXPLANATION: ${q.explanationMd}`,
    ].join("\n\n"),
    json: true,
    maxTokens: 900,
    examId,
  });
  const md = res.json?.md ?? "";
  const cited = citedChunks(res.json?.cites, chunks);
  const [grounded] = cited.length ? await checkGrounding([{ claim: md, cited }], { examId }) : (["no"] as const);
  const sup = computeSupport(cited, grounded);
  if (md) {
    await db.insert(explanations).values({ questionId, bodyMd: md, citationsJson: JSON.stringify(sup.citations), support: sup.support }).onConflictDoNothing();
  }
  return { md: md || "No alternative explanation could be generated.", citations: sup.citations, support: sup.support, cached: false };
}

/** Unseen active questions for an item (never attempted). */
export async function unseenPool(syllabusItemId: number): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(questions)
    .where(
      and(
        eq(questions.syllabusItemId, syllabusItemId),
        eq(questions.status, "active"),
        sql`${questions.id} NOT IN (select question_id from attempts)`,
      ),
    );
  return row?.n ?? 0;
}

/** Queue a top-up run when the unseen pool is low. Non-blocking: scripts/process-jobs.ts performs it. */
export async function enqueueTopUpIfNeeded(syllabusItemId: number): Promise<boolean> {
  const pool = await unseenPool(syllabusItemId);
  if (pool >= PMP.bank.topUpThreshold) return false;
  const examId = await getExamId();
  const [existing] = await db
    .select({ id: generationRuns.id })
    .from(generationRuns)
    .where(and(eq(generationRuns.kind, "topup"), eq(generationRuns.syllabusItemId, syllabusItemId), inArray(generationRuns.status, ["queued", "running"])))
    .limit(1);
  if (existing) return false;
  await db.insert(generationRuns).values({
    examId,
    kind: "topup",
    syllabusItemId,
    status: "queued",
    requested: 20,
    paramsJson: JSON.stringify({ count: 20, difficulty: null, reason: `unseen pool ${pool} < ${PMP.bank.topUpThreshold}` }),
  });
  return true;
}

export function isoWeekStart(d = new Date()): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

/** One coaching summary per week. Returns the existing one when already written. */
export async function weeklyCoaching(force = false): Promise<{ md: string; weekStart: string; cached: boolean }> {
  const examId = await getExamId();
  const weekStart = isoWeekStart();
  if (!force) {
    const [hit] = await db.select().from(coachingSummaries).where(and(eq(coachingSummaries.examId, examId), eq(coachingSummaries.weekStart, weekStart))).limit(1);
    if (hit) return { md: hit.bodyMd, weekStart, cached: true };
  }
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const recent = await db
    .select({
      isCorrect: attempts.isCorrect,
      family: attempts.distractorFamily,
      seconds: attempts.secondsSpent,
      answeredAt: attempts.answeredAt,
      domain: questions.domain,
      item: questions.syllabusItemId,
    })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(gte(attempts.answeredAt, since))
    .orderBy(desc(attempts.answeredAt));

  const stats = summarise(recent);
  const res = await chat<{ md?: string }>({
    purpose: "coaching",
    system: coachingSystemPrompt(),
    user: `Attempt statistics for the last 14 days (JSON):\n${JSON.stringify(stats, null, 2)}\n\nWeek starting ${weekStart}. Exam on ${PMP.examDate}.`,
    json: true,
    maxTokens: 700,
    examId,
  });
  const md = res.json?.md ?? "No summary available.";
  await db.insert(coachingSummaries).values({ examId, weekStart, bodyMd: md, statsJson: JSON.stringify(stats) });
  return { md, weekStart, cached: false };
}

function summarise(rows: Array<{ isCorrect: boolean; family: string | null; seconds: number | null; answeredAt: string; domain: string; item: number }>) {
  const byWeek = new Map<string, { n: number; correct: number }>();
  const families = new Map<string, number>();
  const byDomain = new Map<string, { n: number; correct: number }>();
  let secs = 0;
  let secsN = 0;
  for (const r of rows) {
    const w = isoWeekStart(new Date(r.answeredAt));
    const bw = byWeek.get(w) ?? { n: 0, correct: 0 };
    bw.n++;
    if (r.isCorrect) bw.correct++;
    byWeek.set(w, bw);
    const bd = byDomain.get(r.domain) ?? { n: 0, correct: 0 };
    bd.n++;
    if (r.isCorrect) bd.correct++;
    byDomain.set(r.domain, bd);
    if (!r.isCorrect && r.family) families.set(r.family, (families.get(r.family) ?? 0) + 1);
    if (r.seconds) {
      secs += r.seconds;
      secsN++;
    }
  }
  return {
    attempts: rows.length,
    byWeek: Object.fromEntries(byWeek),
    byDomain: Object.fromEntries(byDomain),
    distractorFamilies: Object.fromEntries([...families.entries()].sort((a, b) => b[1] - a[1])),
    avgSecondsPerQuestion: secsN ? Math.round(secs / secsN) : null,
    paceTargetSeconds: PMP.pacingSecondsPerQuestion,
    note: rows.length < 30 ? "fewer than 30 attempts — percentages are noisy" : undefined,
  };
}
