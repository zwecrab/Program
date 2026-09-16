/**
 * Chunk extracted source Markdown (Phase 2 brief §17.1).
 *
 * ~700 tokens per chunk, 120-token overlap. Split on headings first, then
 * sentences. A numbered process description ("2.7.3 Perform Risk Analysis"
 * through the next numbered heading) is never split unless it is longer than
 * MAX_TOKENS on its own, in which case it splits on sentences with a shared
 * heading prefix so each piece still names the process.
 *
 * Pure functions — no I/O — so the indexer and tests share one implementation.
 */

export interface SourceDoc {
  slug: string;
  book: string;
  section: string;
  pdfPages: [number, number] | null;
  body: string;
}

export interface Chunk {
  text: string;
  tokenCount: number;
  pdfPageStart: number | null;
  pdfPageEnd: number | null;
  printedPage: string | null;
  heading: string | null;
}

export const TARGET_TOKENS = 700;
export const MAX_TOKENS = 1000;
export const OVERLAP_TOKENS = 120;

/** Cheap token estimate; bge-small uses a WordPiece vocab, ~4 chars/token on English prose. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function parseSourceDoc(markdown: string): SourceDoc {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta: Record<string, string> = {};
  if (fm) {
    for (const line of fm[1].split("\n")) {
      const i = line.indexOf(":");
      if (i > 0) meta[line.slice(0, i).trim()] = unquote(line.slice(i + 1).trim());
    }
  }
  const pages = meta.pdf_pages?.match(/(\d+)-(\d+)/);
  return {
    slug: meta.slug ?? "unknown",
    book: meta.book ?? "unknown",
    section: meta.section ?? "",
    pdfPages: pages ? [Number(pages[1]), Number(pages[2])] : null,
    body: fm ? markdown.slice(fm[0].length) : markdown,
  };
}

function unquote(s: string) {
  return s.startsWith('"') && s.endsWith('"') ? JSON.parse(s) : s;
}

interface Block {
  text: string;
  page: number | null;
  printed: string | null;
  heading: string | null;
  /** Part of a numbered process description that must stay whole when possible. */
  atomicId: string | null;
}

const NUMBERED_HEADING = /^(\d+(?:\.\d+){1,3})\s+([A-Z][^\n]{2,90})$/;
const CAPS_HEADING = /^[A-Z][A-Z0-9 ,&'()/-]{6,80}$/;
const TITLE_HEADING = /^(?:[A-Z][a-z]+\s?){1,8}$/;

function isHeading(line: string): string | null {
  const t = line.trim();
  if (!t || t.length > 100) return null;
  if (NUMBERED_HEADING.test(t) || CAPS_HEADING.test(t) || (TITLE_HEADING.test(t) && t.split(" ").length <= 8)) return t;
  return null;
}

/** A bare number near a page boundary is the printed page number. */
function detectPrintedPage(pageText: string): string | null {
  const lines = pageText.split("\n").map((l) => l.trim()).filter(Boolean);
  const edges = [...lines.slice(0, 3), ...lines.slice(-3)];
  for (const l of edges) if (/^\d{1,3}$/.test(l)) return l;
  return null;
}

/** Turn the body into ordered blocks (paragraphs) carrying page + heading context. */
export function toBlocks(body: string): Block[] {
  const blocks: Block[] = [];
  const pageParts = body.split(/<!--\s*page\s+(\d+)\s*-->/);
  // pageParts: [preamble, pageNum, text, pageNum, text, ...]
  let heading: string | null = null;
  let atomic: string | null = null;
  const push = (text: string, page: number | null, printed: string | null) => {
    const paragraphs = text.split(/\n\s*\n/);
    for (const raw of paragraphs) {
      const para = raw.replace(/\s*\n\s*/g, " ").trim();
      if (!para) continue;
      if (/^\d{1,3}$/.test(para)) continue; // stray page number
      const h = isHeading(para);
      if (h) {
        heading = h;
        const num = h.match(NUMBERED_HEADING);
        atomic = num ? num[1] : atomic && num === null ? null : atomic;
        blocks.push({ text: h, page, printed, heading: h, atomicId: atomic });
        continue;
      }
      blocks.push({ text: para, page, printed, heading, atomicId: atomic });
    }
  };
  if (pageParts[0].trim()) push(pageParts[0], null, null);
  for (let i = 1; i < pageParts.length; i += 2) {
    const page = Number(pageParts[i]);
    const text = pageParts[i + 1] ?? "";
    push(text, page, detectPrintedPage(text));
  }
  return blocks;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z(“"])/;

function splitSentences(text: string): string[] {
  return text.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
}

function tailOverlap(text: string, tokens: number): string {
  const chars = tokens * 4;
  if (text.length <= chars) return text;
  const cut = text.slice(-chars);
  const firstSpace = cut.indexOf(" ");
  return firstSpace > 0 ? cut.slice(firstSpace + 1) : cut;
}

export function chunkDocument(doc: SourceDoc, opts: { target?: number; max?: number; overlap?: number } = {}): Chunk[] {
  const target = opts.target ?? TARGET_TOKENS;
  const max = opts.max ?? MAX_TOKENS;
  const overlap = opts.overlap ?? OVERLAP_TOKENS;
  const blocks = toBlocks(doc.body);

  // Group blocks into segments: each numbered process description is one segment; other text groups by heading.
  const segments: Block[][] = [];
  let cur: Block[] = [];
  let curKey: string | null = null;
  for (const b of blocks) {
    const key = b.atomicId ?? `h:${b.heading ?? ""}`;
    if (cur.length && key !== curKey) {
      segments.push(cur);
      cur = [];
    }
    curKey = key;
    cur.push(b);
  }
  if (cur.length) segments.push(cur);

  const chunks: Chunk[] = [];
  let acc: Block[] = [];
  let accText = "";
  let carry = ""; // overlap text carried into the next chunk

  const flush = () => {
    if (!acc.length) return;
    const text = (carry ? carry + " " : "") + accText;
    const pages = acc.map((b) => b.page).filter((p): p is number => p !== null);
    chunks.push({
      text: text.trim(),
      tokenCount: estimateTokens(text),
      pdfPageStart: pages.length ? Math.min(...pages) : null,
      pdfPageEnd: pages.length ? Math.max(...pages) : null,
      printedPage: acc.find((b) => b.printed)?.printed ?? null,
      heading: acc.find((b) => b.heading)?.heading ?? null,
    });
    carry = tailOverlap(accText, overlap);
    acc = [];
    accText = "";
  };

  for (const seg of segments) {
    const segText = seg.map((b) => b.text).join("\n");
    const segTokens = estimateTokens(segText);
    const isAtomic = seg[0].atomicId !== null;

    if (segTokens <= max && (isAtomic || estimateTokens(accText) + segTokens > target)) {
      // Atomic segment (or one that would overflow): give it its own chunk boundary.
      if (accText && estimateTokens(accText) + segTokens > max) flush();
      acc.push(...seg);
      accText = accText ? `${accText}\n${segText}` : segText;
      if (isAtomic || estimateTokens(accText) >= target) flush();
      continue;
    }

    if (segTokens <= max) {
      acc.push(...seg);
      accText = accText ? `${accText}\n${segText}` : segText;
      if (estimateTokens(accText) >= target) flush();
      continue;
    }

    // Oversized segment: split on sentences, prefix each piece with its heading so it still names the process.
    flush();
    const heading = seg.find((b) => b.heading)?.heading ?? null;
    const prefix = heading ? `${heading}\n` : "";
    for (const b of seg) {
      if (b.heading === b.text) continue; // heading line itself
      for (const sentence of splitSentences(b.text)) {
        const candidate = accText ? `${accText} ${sentence}` : `${prefix}${sentence}`;
        if (estimateTokens(candidate) > target && accText) {
          flush();
          acc.push({ ...b, text: sentence });
          accText = `${prefix}${sentence}`;
        } else {
          if (!acc.length || acc[acc.length - 1] !== b) acc.push(b);
          accText = candidate;
        }
      }
    }
    flush();
  }
  flush();
  return chunks.filter((c) => c.tokenCount >= 20);
}

/** Longest run of consecutive words shared between `candidate` and `source`, for the 25-word rule. */
export function longestSharedRun(candidate: string, source: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const a = norm(candidate);
  const b = norm(source);
  if (!a.length || !b.length) return 0;
  const positions = new Map<string, number[]>();
  b.forEach((w, i) => positions.set(w, [...(positions.get(w) ?? []), i]));
  let best = 0;
  for (let i = 0; i < a.length; i++) {
    for (const j of positions.get(a[i]) ?? []) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
  }
  return best;
}
