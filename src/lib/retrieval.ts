/**
 * Hybrid retrieval over source_chunks (Phase 2 brief §17.3):
 * libSQL vector_top_k + FTS5 bm25, merged with reciprocal-rank fusion, then
 * re-ranked toward the syllabus item being asked about and capped at
 * 8 chunks / ~5,000 tokens.
 */
import { client } from "@/db/client";
import { getEmbedder, QUERY_PREFIX, toBlob } from "@/lib/embeddings";

export interface RetrievedChunk {
  id: number;
  sourceBook: string;
  sourceSection: string;
  sourceSlug: string;
  pdfPageStart: number | null;
  pdfPageEnd: number | null;
  printedPage: string | null;
  syllabusItemIds: number[];
  text: string;
  tokenCount: number;
  /** Cosine similarity to the query (0–1), when the chunk came through the vector leg. */
  similarity: number | null;
  /** Fused RRF score, higher is better. */
  score: number;
}

export interface Citation {
  chunk_id: number;
  source_book: string;
  source_section: string;
  printed_page: string | null;
  pdf_page: number | null;
  quote_span?: string;
}

export const MAX_CHUNKS = 8;
export const MAX_TOKENS = 5000;
const CANDIDATES = 24;

export interface RetrieveOptions {
  syllabusItemId?: number | null;
  maxChunks?: number;
  maxTokens?: number;
}

/** Sanitize free text into an FTS5 query: quoted terms OR-ed together, so PMI phrasing still matches. */
export function toFtsQuery(q: string): string {
  const terms = q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  if (!terms.length) return "";
  return [...new Set(terms)].map((t) => `"${t}"`).join(" OR ");
}

const STOP = new Set(["the", "and", "for", "that", "with", "this", "from", "what", "when", "does", "should", "have", "has", "are", "was", "which", "who", "how", "into", "than", "then", "them", "they", "you", "your", "about", "their", "there", "would", "could", "will", "may", "might", "not", "but", "can"]);

export function reciprocalRankFusion(lists: Array<Array<number>>, k = 60): Map<number, number> {
  const scores = new Map<number, number>();
  for (const list of lists) {
    list.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1)));
  }
  return scores;
}

export async function retrieve(query: string, opts: RetrieveOptions = {}): Promise<RetrievedChunk[]> {
  const maxChunks = opts.maxChunks ?? MAX_CHUNKS;
  const maxTokens = opts.maxTokens ?? MAX_TOKENS;

  const embedder = await getEmbedder();
  const [qv] = await embedder.embed([QUERY_PREFIX + query]);

  const vec = await client.execute({
    sql: `SELECT c.id, 1 - vector_distance_cos(c.embedding, ?) AS sim
          FROM vector_top_k('idx_chunks_vec', ?, ?) v JOIN source_chunks c ON c.id = v.id`,
    args: [toBlob(qv), toBlob(qv), CANDIDATES],
  });
  const vecIds = vec.rows.map((r) => Number(r.id));
  const sim = new Map(vec.rows.map((r) => [Number(r.id), Number(r.sim)]));

  const fts = toFtsQuery(query);
  let ftsIds: number[] = [];
  if (fts) {
    const r = await client.execute({
      sql: `SELECT rowid FROM source_chunks_fts WHERE source_chunks_fts MATCH ? ORDER BY bm25(source_chunks_fts) LIMIT ?`,
      args: [fts, CANDIDATES],
    });
    ftsIds = r.rows.map((x) => Number(x.rowid));
  }

  const fused = reciprocalRankFusion([vecIds, ftsIds]);
  if (fused.size === 0) return [];

  const ids = [...fused.keys()];
  const rows = await client.execute({
    sql: `SELECT id, source_book, source_section, source_slug, pdf_page_start, pdf_page_end, printed_page, syllabus_item_ids, text, token_count
          FROM source_chunks WHERE id IN (${ids.map(() => "?").join(",")})`,
    args: ids,
  });

  const chunks: RetrievedChunk[] = rows.rows.map((r) => {
    const itemIds = JSON.parse(String(r.syllabus_item_ids ?? "[]")) as number[];
    let score = fused.get(Number(r.id)) ?? 0;
    // Re-rank toward the task being asked about (§17.3): a boost, not a filter, so cross-domain facts still surface.
    if (opts.syllabusItemId && itemIds.includes(opts.syllabusItemId)) score *= 1.5;
    return {
      id: Number(r.id),
      sourceBook: String(r.source_book),
      sourceSection: String(r.source_section),
      sourceSlug: String(r.source_slug),
      pdfPageStart: r.pdf_page_start === null ? null : Number(r.pdf_page_start),
      pdfPageEnd: r.pdf_page_end === null ? null : Number(r.pdf_page_end),
      printedPage: r.printed_page === null ? null : String(r.printed_page),
      syllabusItemIds: itemIds,
      text: String(r.text),
      tokenCount: Number(r.token_count),
      similarity: sim.get(Number(r.id)) ?? null,
      score,
    };
  });

  chunks.sort((a, b) => b.score - a.score);
  const out: RetrievedChunk[] = [];
  let tokens = 0;
  for (const c of chunks) {
    if (out.length >= maxChunks || tokens + c.tokenCount > maxTokens) break;
    out.push(c);
    tokens += c.tokenCount;
  }
  return out;
}

export function toCitation(c: RetrievedChunk, quoteSpan?: string): Citation {
  return {
    chunk_id: c.id,
    source_book: c.sourceBook,
    source_section: c.sourceSection,
    printed_page: c.printedPage,
    pdf_page: c.pdfPageStart,
    quote_span: quoteSpan,
  };
}

/** Format chunks for a prompt: numbered, with page references the model must cite by number. */
export function formatContext(chunks: RetrievedChunk[]): string {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.sourceBook} — ${c.sourceSection}${c.printedPage ? ` (p. ${c.printedPage}` : c.pdfPageStart ? ` (PDF p. ${c.pdfPageStart}` : " ("}${c.printedPage && c.pdfPageStart ? `, PDF p. ${c.pdfPageStart}` : ""})\n${c.text}`,
    )
    .join("\n\n");
}
