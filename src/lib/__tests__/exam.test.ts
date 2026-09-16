import { beforeAll, describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

process.env.DATABASE_URL = "file:./data/test-exam.db";
process.env.EMBEDDINGS = "fake";
process.env.LLM_TRANSPORT = "mock";
process.env.OPENROUTER_API_KEY = "mock";
await rm("./data/test-exam.db", { force: true });

const { scoreAnswer } = await import("@/lib/scoring");
const { schedule, previewIntervals } = await import("@/lib/fsrs");

describe("scoring", () => {
  const opts = [
    { id: 1, label: "A", body: "", isCorrect: true, distractorFamily: null, rationale: "", questionId: 1 },
    { id: 2, label: "B", body: "", isCorrect: false, distractorFamily: "wait_or_defer", rationale: "", questionId: 1 },
    { id: 3, label: "C", body: "", isCorrect: true, distractorFamily: null, rationale: "", questionId: 1 },
  ];
  it("single: exact match, family from the wrong pick", () => {
    expect(scoreAnswer("single", opts.slice(0, 2), null, [1]).isCorrect).toBe(true);
    const r = scoreAnswer("single", opts.slice(0, 2), null, [2]);
    expect(r.isCorrect).toBe(false);
    expect(r.family).toBe("wait_or_defer");
  });
  it("multi: needs the exact set", () => {
    expect(scoreAnswer("multi", opts, null, [1, 3]).isCorrect).toBe(true);
    expect(scoreAnswer("multi", opts, null, [1]).isCorrect).toBe(false);
    expect(scoreAnswer("multi", opts, null, [1, 2, 3]).family).toBe("wait_or_defer");
  });
  it("pull_down_list: every blank must be right", () => {
    const ex = {
      kind: "pull_down_list" as const,
      template: "{{a}} {{b}}",
      blanks: [
        { id: "a", choices: [{ id: "x", text: "x", is_correct: true, rationale: "r" }, { id: "y", text: "y", is_correct: false, distractor_family: "risk_issue_confusion" as const, rationale: "r" }] },
        { id: "b", choices: [{ id: "p", text: "p", is_correct: true, rationale: "r" }, { id: "q", text: "q", is_correct: false, distractor_family: "overcorrect" as const, rationale: "r" }] },
      ],
    };
    expect(scoreAnswer("pull_down_list", [], ex, { a: "x", b: "p" }).isCorrect).toBe(true);
    const r = scoreAnswer("pull_down_list", [], ex, { a: "x", b: "q" });
    expect(r.isCorrect).toBe(false);
    expect(r.family).toBe("overcorrect");
  });
});

describe("fsrs", () => {
  const card = { id: 1, examId: 1, syllabusItemId: 23, lessonId: null, front: "f", back: "b", cardType: "recall" as const, fsrsStability: 0, fsrsDifficulty: 0, fsrsState: 0, lastReviewAt: null, dueAt: new Date().toISOString(), lapses: 0, reps: 0 };
  it("schedules a new card further out for easy than again", () => {
    const again = schedule(card, "again");
    const easy = schedule(card, "easy");
    expect(new Date(easy.dueAt).getTime()).toBeGreaterThan(new Date(again.dueAt).getTime());
    expect(easy.reps).toBe(1);
    const p = previewIntervals(card);
    expect(p.again).toMatch(/m|h|d/);
  });
});

describe("exam simulator (mock bank)", () => {
  beforeAll(async () => {
    const { migrateAndSeed } = await import("@/db/migrate");
    await migrateAndSeed();
    const { getExamId } = await import("@/db/queries");
    const { indexDocument, rebuildFts } = await import("@/lib/indexer");
    const { fakeEmbedder } = await import("@/lib/embeddings");
    const { parseSourceDoc } = await import("@/lib/chunking");
    const examId = await getExamId();
    for (const f of ["reserves.md", "risk.md"]) await indexDocument(parseSourceDoc(await readFile(resolve(__dirname, `fixtures/${f}`), "utf8")), fakeEmbedder(), examId);
    await rebuildFts();
    const { generateQuestionsForItem } = await import("@/lib/generation/pipeline");
    // three tasks so the domain weighting has something to pick from
    for (const [task, seed] of [[23, 1], [9, 2], [1, 3]] as const) await generateQuestionsForItem(task, { count: 10, difficulty: null, ignoreCap: true, seed });
    const { db } = await import("@/db/client");
    const { questions } = await import("@/db/schema");
    await db.update(questions).set({ status: "active" }); // the mock's near-duplicate stems fail QA by design; activate for the paper
  }, 180_000);

  it("builds a paper with case items first and pretest ids marked", async () => {
    const { buildPaper } = await import("@/lib/exam");
    const p = await buildPaper(5);
    expect(p.order.length).toBeGreaterThan(10);
    expect(p.short).toBe(true); // 30 < 180 in this fixture
    expect(new Set(p.order).size).toBe(p.order.length);
    for (const id of p.caseIds) expect(p.order.indexOf(id)).toBeLessThan(p.caseIds.length);
    for (const id of p.pretestIds) expect(p.caseIds).not.toContain(id);
  });

  it("locks the case block one-way and scores 170/10 split on submit", async () => {
    const { createMock, loadExam, saveAnswer, lockCaseBlock, submitExam, mockResults } = await import("@/lib/exam");
    const { id } = await createMock();
    let ex = (await loadExam(id))!;
    const firstCase = ex.state.caseIds[0];
    if (firstCase) {
      expect((await saveAnswer(id, firstCase, [], 5)).locked).toBeUndefined();
      await lockCaseBlock(id, false);
      ex = (await loadExam(id))!;
      expect(ex.state.caseLocked).toBe(true);
      expect((await saveAnswer(id, firstCase, [], 5)).locked).toBe(true); // cannot change a case answer after the gate
    }
    // answer everything else with the first option where there is one
    const { loadQuestion } = await import("@/lib/sessions");
    for (const qid of ex.state.order.filter((q) => !ex.state.caseIds.includes(q))) {
      const lq = (await loadQuestion(qid))!;
      const chosen = lq.options.length ? [lq.options.find((o) => o.isCorrect)!.id] : null;
      await saveAnswer(id, qid, chosen, 40);
    }
    await submitExam(id, "user");
    ex = (await loadExam(id))!;
    expect(ex.state.stage).toBe("done");
    const r = (await mockResults(id))!;
    expect(r.overall.n + r.pretest.n).toBe(ex.state.order.length);
    expect(r.pretest.n).toBe(ex.state.pretestIds.length);
    expect(r.byDomain.length).toBe(3);
    expect(typeof r.verdict.go).toBe("boolean");
    // second submit is a no-op
    await submitExam(id, "user");
  }, 120_000);
});
