import { beforeAll, describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";

process.env.DATABASE_URL = "file:./data/test-pipeline.db";
process.env.EMBEDDINGS = "fake";
process.env.LLM_TRANSPORT = "mock";
process.env.OPENROUTER_API_KEY = "mock";
await rm("./data/test-pipeline.db", { force: true });

const { parseSourceDoc } = await import("@/lib/chunking");

describe("generation pipeline (mock LLM)", () => {
  beforeAll(async () => {
    const { migrateAndSeed } = await import("@/db/migrate");
    await migrateAndSeed();
    const { getExamId } = await import("@/db/queries");
    const { indexDocument, rebuildFts } = await import("@/lib/indexer");
    const { fakeEmbedder } = await import("@/lib/embeddings");
    const examId = await getExamId();
    for (const f of ["reserves.md", "risk.md"]) {
      await indexDocument(parseSourceDoc(await readFile(resolve(__dirname, `fixtures/${f}`), "utf8")), fakeEmbedder(), examId);
    }
    await rebuildFts();
  }, 60_000);

  it("generates a lesson with 12 flashcards, citations and a support level", async () => {
    const { generateLesson } = await import("@/lib/generation/lessons");
    const r = await generateLesson(23, { ignoreCap: true });
    expect(r.flashcards).toBe(12);
    expect(["high", "medium", "low"]).toContain(r.support.support);
    expect(r.support.citations.length).toBeGreaterThan(0);
    expect(r.plagiarismHits).toEqual([]);
    const { db } = await import("@/db/client");
    const { lessons, flashcards, llmUsage } = await import("@/db/schema");
    const [l] = await db.select().from(lessons).where(eq(lessons.syllabusItemId, 23));
    expect(l.reviewed).toBe(false);
    expect(l.trapsMd).toBeTruthy();
    expect(JSON.parse(l.citationsJson!).overall[0].pdf_page).not.toBeNull();
    expect((await db.select().from(flashcards).where(eq(flashcards.syllabusItemId, 23))).length).toBe(12);
    const usage = await db.select().from(llmUsage);
    expect(usage.length).toBeGreaterThanOrEqual(2); // lesson + grounding
    expect(usage.every((u) => u.costUsd >= 0)).toBe(true);
  }, 60_000);

  it("generates, QAs and activates questions across item types, each with families, rationales and a citation", async () => {
    const { generateQuestionsForItem } = await import("@/lib/generation/pipeline");
    const r = await generateQuestionsForItem(23, { count: 12, difficulty: null, ignoreCap: true, seed: 7 });
    expect(r.generated).toBe(12);
    expect(r.active + r.quarantined + r.failed).toBe(12);
    expect(r.active).toBeGreaterThan(0);
    const { db } = await import("@/db/client");
    const { questions, options, generationRuns } = await import("@/db/schema");
    const rows = await db.select().from(questions).where(eq(questions.syllabusItemId, 23));
    expect(rows.length).toBe(12);
    for (const q of rows) {
      expect(q.qaJson).toBeTruthy();
      expect(JSON.parse(q.citationsJson!).length).toBeGreaterThan(0);
      const opts = await db.select().from(options).where(eq(options.questionId, q.id));
      if (["single", "multi", "graphic", "case"].includes(q.itemType)) {
        expect(opts.length).toBeGreaterThanOrEqual(4);
        for (const o of opts) {
          expect(o.rationale.length).toBeGreaterThan(0);
          if (!o.isCorrect) expect(o.distractorFamily).toBeTruthy();
        }
      } else {
        expect(opts.length).toBe(0);
        expect(q.exhibitJson).toBeTruthy();
      }
    }
    const [run] = await db.select().from(generationRuns).where(eq(generationRuns.id, r.runId));
    expect(run.status).toBe("done");
    expect(run.costUsd).toBeGreaterThan(0);
  }, 120_000);

  it("deterministic QA catches absolutes-only-in-wrong-options and near-duplicates", async () => {
    const { deterministicChecks, trigramSimilarity } = await import("@/lib/generation/qa");
    const base = {
      syllabus_item_id: 23, domain: "business_environment", delivery_approach: "hybrid", item_type: "single", difficulty: 2, style: "first",
      stem: "A supplier reports a component may arrive late. What should the project manager do first?",
      explanation_md: "x", pmbok_ref: null, exhibit: null,
      options: [
        { label: "A", body: "Analyse the impact.", is_correct: true, distractor_family: null, rationale: "r" },
        { label: "B", body: "Always escalate to the sponsor.", is_correct: false, distractor_family: "escalate_prematurely", rationale: "r" },
        { label: "C", body: "Wait.", is_correct: false, distractor_family: "wait_or_defer", rationale: "r" },
        { label: "D", body: "Log an issue.", is_correct: false, distractor_family: "risk_issue_confusion", rationale: "r" },
      ],
    } as const;
    const rep = deterministicChecks(base as never, { bankStems: [{ id: 99, stem: base.stem }], sourceTexts: [] });
    expect(rep.ok).toBe(false);
    expect(rep.problems.some((p) => p.includes("absolute"))).toBe(true);
    expect(rep.nearDuplicateOf).toBe(99);
    expect(trigramSimilarity("contingency reserve", "contingency reserve")).toBe(1);
  });

  it("answers from the materials with citations, and says so when it cannot", async () => {
    const { ask } = await import("@/lib/generation/runtime");
    const yes = await ask("When does a project manager raise a change request for the management reserve?");
    expect(yes.found).toBe(true);
    expect(yes.citations.length).toBeGreaterThanOrEqual(1);
    const no = await ask("What is the CFA Level 1 pass rate?");
    expect(no.found).toBe(false);
    expect(no.md).toContain("I could not find this in your materials");
  }, 60_000);
});
