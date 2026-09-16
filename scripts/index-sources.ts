/**
 * Chunk + embed content/source/*.md into source_chunks (Phase 2 brief §17).
 *
 *   npm run index:sources              # every file in content/source
 *   npm run index:sources -- pd-risk   # one slug (replaces its chunks)
 *
 * First run downloads Xenova/bge-small-en-v1.5 (~130 MB) into the
 * transformers.js cache. Nothing is sent anywhere.
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { generationRuns, sourceChunks } from "../src/db/schema";
import { migrateAndSeed } from "../src/db/migrate";
import { getExamId } from "../src/db/queries";
import { parseSourceDoc } from "../src/lib/chunking";
import { indexDocument, rebuildFts } from "../src/lib/indexer";
import { getEmbedder } from "../src/lib/embeddings";
import { PMP } from "../config/exams/pmp";

const SRC = resolve(process.cwd(), "content/source");
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

async function main() {
  await migrateAndSeed();
  const examId = await getExamId();
  const files = (await readdir(SRC).catch(() => [] as string[])).filter((f) => f.endsWith(".md"));
  const wanted = files.filter((f) => only.length === 0 || only.includes(basename(f, ".md")));
  if (!wanted.length) throw new Error(`No source files in content/source/. Run npm run extract:sources first.`);

  const embedder = await getEmbedder();
  console.log(`Embedder: ${embedder.name} (${embedder.dims} dims)`);
  const [run] = await db
    .insert(generationRuns)
    .values({ examId, kind: "index", status: "running", startedAt: new Date().toISOString(), paramsJson: JSON.stringify({ files: wanted }) })
    .returning({ id: generationRuns.id });

  let total = 0;
  for (const f of wanted) {
    const doc = parseSourceDoc(await readFile(join(SRC, f), "utf8"));
    const n = await indexDocument(doc, embedder, examId);
    total += n;
    const itemIds = PMP.sourceToSyllabus[doc.slug] ?? [];
    console.log(`  ✓ ${doc.slug.padEnd(16)} ${String(n).padStart(4)} chunks  pages ${doc.pdfPages?.join("–") ?? "?"}  → items ${itemIds.join(",") || "—"}`);
  }
  await rebuildFts();
  await db
    .update(generationRuns)
    .set({ status: "done", produced: total, passed: total, endedAt: new Date().toISOString(), log: `${total} chunks from ${wanted.length} files` })
    .where(eq(generationRuns.id, run.id));
  const [{ n }] = (await db.select({ n: sql<number>`count(*)` }).from(sourceChunks)) as Array<{ n: number }>;
  console.log(`\nIndexed ${total} chunks (${n} total in source_chunks).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("index-sources failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
