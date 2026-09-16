/**
 * Extract source slices from the PMI PDFs into content/source/<slug>.md.
 *
 * Runs on YOUR machine only. The output is gitignored and never leaves it.
 *
 *   npm run extract:sources            # all entries in config/source-map.json
 *   npm run extract:sources -- pd-risk # one slug
 *
 * Each output file carries YAML front matter and `<!-- page N -->` markers
 * (PDF page numbers) so the indexer can cite pages.
 */
import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { PDFParse } from "pdf-parse";

interface SourceEntry {
  slug: string;
  file: string;
  book: string;
  section: string;
  pages: [number, number] | null;
  chapters?: string[];
}

const SOURCE_DIR = process.env.SOURCE_DIR || "D:\\Backup\\Projects\\PMP\\New Materials";
const OUT_DIR = resolve(process.cwd(), "content/source");
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));

async function main() {
  const map = JSON.parse(await readFile(resolve(process.cwd(), "config/source-map.json"), "utf8")) as { sources: SourceEntry[] };
  const entries = map.sources.filter((s) => only.length === 0 || only.includes(s.slug));
  if (!entries.length) throw new Error(`No source-map entries match: ${only.join(", ")}`);
  await mkdir(OUT_DIR, { recursive: true });

  const parsers = new Map<string, { parser: PDFParse; total: number }>();
  const getParser = async (file: string) => {
    const hit = parsers.get(file);
    if (hit) return hit;
    const path = join(SOURCE_DIR, file);
    if (!existsSync(path)) throw new Error(`PDF not found: ${path}\nSet SOURCE_DIR in .env to the folder holding the PMI PDFs.`);
    const parser = new PDFParse({ data: await readFile(path) });
    const info = await parser.getInfo();
    const entry = { parser, total: info.total };
    parsers.set(file, entry);
    return entry;
  };

  for (const e of entries) {
    const { parser, total } = await getParser(e.file);
    const [first, last] = e.pages ?? [1, total];
    if (last > total) console.warn(`  ! ${e.slug}: requested pages ${first}-${last} but ${e.file} has ${total} pages; clamping`);
    const result = await parser.getText({ first, last: Math.min(last, total) });
    let pages = result.pages;
    if (!e.pages && e.chapters?.length) pages = filterChapters(pages, e.chapters);

    const body = pages.map((p) => `<!-- page ${p.num} -->\n${clean(p.text)}`).join("\n\n");
    const words = body.split(/\s+/).length;
    const fm = [
      "---",
      `slug: ${e.slug}`,
      `book: ${JSON.stringify(e.book)}`,
      `section: ${JSON.stringify(e.section)}`,
      `file: ${JSON.stringify(e.file)}`,
      `pdf_pages: ${pages[0]?.num ?? first}-${pages[pages.length - 1]?.num ?? last}`,
      `extracted_at: ${new Date().toISOString()}`,
      "---",
      "",
    ].join("\n");
    await writeFile(join(OUT_DIR, `${e.slug}.md`), fm + body + "\n", "utf8");
    console.log(`  ✓ ${e.slug.padEnd(16)} pages ${first}-${last} → ${pages.length} pages, ~${words} words`);
  }
  for (const { parser } of parsers.values()) await parser.destroy();
  console.log(`\nWrote ${entries.length} file(s) to content/source/. Next: npm run index:sources`);
}

/** Keep only pages that fall inside the wanted chapters, judged by "Chapter N" / "N." headings at page top. */
function filterChapters(pages: Array<{ num: number; text: string }>, wanted: string[]): Array<{ num: number; text: string }> {
  const out: typeof pages = [];
  let current: string | null = null;
  for (const p of pages) {
    const head = p.text.slice(0, 400);
    const m = head.match(/(?:^|\n)\s*(?:CHAPTER|Chapter)\s+(\d+)\b/) ?? head.match(/(?:^|\n)\s*(\d)\s*\n\s*[A-Z][A-Za-z ,&-]{6,}/);
    if (m) current = m[1];
    if (current && wanted.includes(current)) out.push(p);
  }
  // If the heuristic found nothing, keep everything rather than silently emit an empty file.
  return out.length ? out : pages;
}

/** Normalise whitespace and glue hyphenated line breaks; keep paragraph breaks. */
function clean(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

main().catch((err) => {
  console.error("extract-sources failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
