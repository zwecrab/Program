import { beforeAll, describe, expect, it } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

process.env.DATABASE_URL = "file:./data/test-retrieval.db";
process.env.EMBEDDINGS = "fake";
await rm("./data/test-retrieval.db", { force: true }); // before any module opens the file

const { chunkDocument, parseSourceDoc, longestSharedRun } = await import("@/lib/chunking");
const { toFtsQuery, reciprocalRankFusion } = await import("@/lib/retrieval");

describe("chunking", () => {
  it("parses front matter and page markers, keeps numbered processes whole", async () => {
    const md = await readFile(resolve(__dirname, "fixtures/reserves.md"), "utf8");
    const doc = parseSourceDoc(md);
    expect(doc.slug).toBe("pd-finance");
    expect(doc.pdfPages).toEqual([163, 165]);
    const chunks = chunkDocument(doc);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    const reserves = chunks.find((c) => c.text.includes("Set Aside Reserves"));
    expect(reserves).toBeDefined();
    expect(reserves!.text).toContain("contingency reserve");
    expect(reserves!.text).toContain("management reserve");
    expect(reserves!.pdfPageStart).toBe(163);
    expect(reserves!.pdfPageEnd).toBe(164);
    expect(reserves!.printedPage).toBe("163");
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(1000);
  });
  it("measures the longest shared word run for the 25-word rule", () => {
    const src = "a contingency reserve is money held for risks the team has already identified and analysed";
    expect(longestSharedRun("The contingency reserve is money held for risks the team has found", src)).toBe(10);
    expect(longestSharedRun("completely different words here", src)).toBe(0);
  });
  it("builds an FTS query and fuses ranks", () => {
    expect(toFtsQuery("contingency reserve versus management reserve")).toBe('"contingency" OR "reserve" OR "versus" OR "management"');
    const fused = reciprocalRankFusion([[1, 2, 3], [3, 1]]);
    expect([...fused.entries()].sort((a, b) => b[1] - a[1])[0][0]).toBe(1);
  });
});

describe("hybrid retrieval (fake embedder, fixture corpus)", () => {
  beforeAll(async () => {
    const { migrateAndSeed } = await import("@/db/migrate");
    await migrateAndSeed();
    const { getExamId } = await import("@/db/queries");
    const { indexDocument, rebuildFts } = await import("@/lib/indexer");
    const { fakeEmbedder } = await import("@/lib/embeddings");
    const examId = await getExamId();
    for (const f of ["reserves.md", "risk.md"]) {
      const doc = parseSourceDoc(await readFile(resolve(__dirname, `fixtures/${f}`), "utf8"));
      await indexDocument(doc, fakeEmbedder(), examId);
    }
    await rebuildFts();
  }, 60_000);

  it("returns finance and risk chunks with page numbers for the reserves question", async () => {
    const { retrieve } = await import("@/lib/retrieval");
    const hits = await retrieve("contingency reserve versus management reserve", { syllabusItemId: 14 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].text).toMatch(/reserve/);
    expect(hits[0].pdfPageStart).not.toBeNull();
    const slugs = new Set(hits.map((h) => h.sourceSlug));
    expect(slugs.has("pd-finance")).toBe(true);
    expect(slugs.has("pd-risk")).toBe(true);
    expect(hits.every((h) => h.tokenCount > 0)).toBe(true);
    expect(hits.reduce((a, h) => a + h.tokenCount, 0)).toBeLessThanOrEqual(5000);
  });

  it("boosts chunks tagged with the requested syllabus item", async () => {
    const { retrieve } = await import("@/lib/retrieval");
    const hits = await retrieve("escalate a threat response outside project authority", { syllabusItemId: 23 });
    expect(hits[0].sourceSlug).toBe("pd-risk");
    expect(hits[0].syllabusItemIds).toContain(23);
  });
});
