import { eq } from "drizzle-orm";
import { db, client } from "@/db/client";
import { sourceChunks } from "@/db/schema";
import { chunkDocument, type SourceDoc } from "@/lib/chunking";
import { toBlob, type Embedder } from "@/lib/embeddings";
import { PMP } from "../../config/exams/pmp";

/** Replace a source document's chunks in source_chunks. Returns the chunk count. */
export async function indexDocument(doc: SourceDoc, embedder: Embedder, examId: number): Promise<number> {
  const chunks = chunkDocument(doc);
  const itemIds = PMP.sourceToSyllabus[doc.slug] ?? [];
  await db.delete(sourceChunks).where(eq(sourceChunks.sourceSlug, doc.slug));
  if (!chunks.length) return 0;
  const vectors = await embedder.embed(chunks.map((c) => c.text));
  const rows = chunks.map((c, i) => ({
    examId,
    sourceBook: doc.book,
    sourceSection: c.heading ? `${doc.section} › ${c.heading}` : doc.section,
    sourceSlug: doc.slug,
    pdfPageStart: c.pdfPageStart,
    pdfPageEnd: c.pdfPageEnd,
    printedPage: c.printedPage,
    syllabusItemIds: JSON.stringify(itemIds),
    text: c.text,
    tokenCount: c.tokenCount,
    embedding: toBlob(vectors[i]),
  }));
  for (let i = 0; i < rows.length; i += 50) await db.insert(sourceChunks).values(rows.slice(i, i + 50));
  return rows.length;
}

/** FTS5 external-content table: rebuild after bulk changes so it mirrors source_chunks. */
export async function rebuildFts(): Promise<void> {
  await client.execute("INSERT INTO source_chunks_fts(source_chunks_fts) VALUES ('rebuild')");
}
