import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { flashcards, lessons, sourceChunks, type SyllabusItem } from "@/db/schema";
import { getEcoTask, getExamId, getLessonForTask } from "@/db/queries";
import { chat } from "@/lib/llm";
import { retrieve, type RetrievedChunk } from "@/lib/retrieval";
import { longestSharedRun } from "@/lib/chunking";
import { lessonSystemPrompt, lessonUserPrompt } from "./prompts";
import { checkGrounding, citedChunks, computeSupport, type SupportResult } from "./support";
import { env } from "@/lib/env";

const section = z.object({ md: z.string().trim().min(40), cites: z.array(z.number().int().min(1)).default([]) });

export const lessonOutputSchema = z.object({
  title_en: z.string().trim().min(3),
  title_my: z.string().trim().optional().default(""),
  summary_my: z.string().trim().optional().default(""),
  sections: z.object({
    what: section,
    where: section,
    predictive: section,
    adaptive: section,
    artifacts: section,
    traps: section,
    example: section,
  }),
  pmbok_refs: z.array(z.string()).default([]),
  flashcards: z
    .array(z.object({ front: z.string().trim().min(3), back: z.string().trim().min(1), card_type: z.enum(["recall", "discrimination", "application"]) }))
    .min(8)
    .max(16),
});
export type LessonOutput = z.infer<typeof lessonOutputSchema>;

export const SECTION_KEYS = ["what", "where", "predictive", "adaptive", "artifacts", "traps", "example"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export interface LessonResult {
  lessonId: number;
  version: number;
  support: SupportResult;
  perSection: Record<SectionKey, SupportResult>;
  flashcards: number;
  plagiarismHits: Array<{ section: SectionKey; run: number }>;
  costUsd: number;
}

/** Retrieval queries that cover the seven lesson sections without one giant query. */
export function lessonQueries(item: SyllabusItem): string[] {
  return [
    item.title,
    `${item.title} process inputs outputs PMBOK 8 performance domain`,
    `${item.title} predictive life cycle plan baseline`,
    `${item.title} adaptive hybrid agile iteration backlog`,
    `${item.title} artifacts documents plan components approval`,
    `${item.title} common mistakes escalation risk issue`,
  ];
}

export async function retrieveForLesson(item: SyllabusItem): Promise<RetrievedChunk[]> {
  const seen = new Map<number, RetrievedChunk>();
  for (const q of lessonQueries(item)) {
    for (const c of await retrieve(q, { syllabusItemId: item.id, maxChunks: 4 })) if (!seen.has(c.id)) seen.set(c.id, c);
  }
  // Cap total context: ~8 best by score, ~5k tokens (§17.3).
  const all = [...seen.values()].sort((a, b) => b.score - a.score);
  const out: RetrievedChunk[] = [];
  let tokens = 0;
  for (const c of all) {
    if (out.length >= 8 || tokens + c.tokenCount > 5000) break;
    out.push(c);
    tokens += c.tokenCount;
  }
  return out;
}

export async function generateLesson(syllabusItemId: number, opts: { runId?: number | null; ignoreCap?: boolean } = {}): Promise<LessonResult> {
  const item = await getEcoTask(syllabusItemId);
  if (!item) throw new Error(`syllabus item ${syllabusItemId} not found`);
  const examId = await getExamId();
  const chunks = await retrieveForLesson(item);
  if (chunks.length === 0) throw new Error("No source chunks indexed. Run npm run extract:sources && npm run index:sources first.");

  let cost = 0;
  let parsed: LessonOutput | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 3 && !parsed; attempt++) {
    const res = await chat<unknown>({
      purpose: "lesson",
      system: lessonSystemPrompt(),
      user: lessonUserPrompt(item, chunks) + (lastErr ? `\n\nYour previous answer failed validation: ${lastErr}. Fix it.` : ""),
      json: true,
      maxTokens: 6000,
      runId: opts.runId,
      examId,
      ignoreCap: opts.ignoreCap,
    });
    cost += res.costUsd;
    const v = lessonOutputSchema.safeParse(res.json);
    if (v.success) parsed = v.data;
    else lastErr = v.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 600);
  }
  if (!parsed) throw new Error(`lesson generation failed schema validation 3×: ${lastErr}`);

  // Grounding: one call, one claim per section.
  const claims = SECTION_KEYS.map((k) => ({ claim: parsed!.sections[k].md, cited: citedChunks(parsed!.sections[k].cites, chunks) }));
  const grounded = await checkGrounding(claims, { runId: opts.runId, examId, ignoreCap: opts.ignoreCap });
  const perSection = Object.fromEntries(SECTION_KEYS.map((k, i) => [k, computeSupport(claims[i].cited, grounded[i])])) as Record<SectionKey, SupportResult>;
  const allCited = [...new Map(claims.flatMap((c) => c.cited).map((c) => [c.id, c])).values()];
  const worst = SECTION_KEYS.map((k) => perSection[k].support).includes("low") ? "low" : SECTION_KEYS.every((k) => perSection[k].support === "high") ? "high" : "medium";
  const support: SupportResult = { ...computeSupport(allCited, worst === "low" ? "no" : worst === "high" ? "yes" : "partly"), support: worst };

  // 25-word rule against every indexed chunk for this task's sources (§17.5).
  const corpus = await db.select({ text: sourceChunks.text }).from(sourceChunks);
  const plagiarismHits: LessonResult["plagiarismHits"] = [];
  for (const k of SECTION_KEYS) {
    let worstRun = 0;
    for (const row of corpus) worstRun = Math.max(worstRun, longestSharedRun(parsed.sections[k].md, row.text));
    if (worstRun >= 25) plagiarismHits.push({ section: k, run: worstRun });
  }

  const prev = await getLessonForTask(item.id);
  const version = (prev?.version ?? 0) + 1;
  const [row] = await db
    .insert(lessons)
    .values({
      examId,
      syllabusItemId: item.id,
      version,
      titleEn: parsed.title_en,
      titleMy: parsed.title_my || null,
      bodyMd: `${parsed.sections.what.md}\n\n## Where it sits in PMBOK 8\n\n${parsed.sections.where.md}${parsed.summary_my ? `\n\n## အနှစ်ချုပ် (Burmese summary)\n\n${parsed.summary_my}` : ""}`,
      predictiveMd: parsed.sections.predictive.md,
      adaptiveMd: parsed.sections.adaptive.md,
      trapsMd: parsed.sections.traps.md,
      artifactsMd: parsed.sections.artifacts.md,
      exampleMd: parsed.sections.example.md,
      pmbokRefsJson: JSON.stringify(parsed.pmbok_refs),
      citationsJson: JSON.stringify({ overall: support.citations, sections: Object.fromEntries(SECTION_KEYS.map((k) => [k, perSection[k]])), plagiarism: plagiarismHits }),
      support: plagiarismHits.length ? "low" : support.support,
      modelUsed: env.openrouterModel,
      reviewed: false,
    })
    .returning({ id: lessons.id });

  // Replace this task's flashcards that came from an earlier lesson version.
  await db.delete(flashcards).where(eq(flashcards.syllabusItemId, item.id));
  await db.insert(flashcards).values(
    parsed.flashcards.slice(0, 12).map((f) => ({
      examId,
      syllabusItemId: item.id,
      lessonId: row.id,
      front: f.front,
      back: f.back,
      cardType: f.card_type,
    })),
  );

  return { lessonId: row.id, version, support, perSection, flashcards: Math.min(12, parsed.flashcards.length), plagiarismHits, costUsd: cost };
}
