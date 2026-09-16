/**
 * Support score (Phase 2 brief §17.4). Not model self-confidence — derived
 * from retrieval similarity, chunk agreement and a strict grounding check.
 */
import { chat } from "@/lib/llm";
import { groundingSystemPrompt, groundingUserPrompt } from "./prompts";
import { toCitation, type Citation, type RetrievedChunk } from "@/lib/retrieval";
import type { SupportLevel } from "@/db/schema";

export type Grounded = "yes" | "partly" | "no";

export interface SupportResult {
  support: SupportLevel;
  retrieval_score: number;
  chunk_agreement: number;
  is_grounded: Grounded;
  citations: Citation[];
}

/** Map excerpt numbers ([1]-based) the model cited to chunks; drop bad indices. */
export function citedChunks(cites: number[] | undefined, chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<number>();
  const out: RetrievedChunk[] = [];
  for (const n of cites ?? []) {
    const c = chunks[n - 1];
    if (c && !seen.has(c.id)) {
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}

export function computeSupport(cited: RetrievedChunk[], grounded: Grounded): SupportResult {
  const sims = cited.map((c) => c.similarity).filter((s): s is number => s !== null);
  // Without a vector similarity (FTS-only hit) treat presence as moderate evidence.
  const retrieval_score = sims.length ? Math.max(...sims) : cited.length ? 0.6 : 0;
  const chunk_agreement = cited.length;
  let support: SupportLevel = "low";
  if (grounded === "yes" && chunk_agreement >= 2 && retrieval_score >= 0.72) support = "high";
  else if (grounded !== "no" && chunk_agreement >= 1) support = "medium";
  return { support, retrieval_score, chunk_agreement, is_grounded: grounded, citations: cited.map((c) => toCitation(c)) };
}

/** One cheap call: does the cited text support each claim? */
export async function checkGrounding(
  claims: Array<{ claim: string; cited: RetrievedChunk[] }>,
  opts: { runId?: number | null; examId?: number | null; ignoreCap?: boolean } = {},
): Promise<Grounded[]> {
  const items = claims.map((c) => ({
    claim: c.claim.slice(0, 1200),
    evidence: c.cited.length ? c.cited.map((ch) => ch.text.slice(0, 1500)).join("\n---\n") : "(no citation)",
  }));
  if (!items.length) return [];
  const res = await chat<{ verdicts: Array<{ i: number; grounded: Grounded }> }>({
    purpose: "grounding",
    system: groundingSystemPrompt(),
    user: groundingUserPrompt(items),
    json: true,
    temperature: 0,
    maxTokens: 800,
    ...opts,
  });
  const out: Grounded[] = claims.map((c) => (c.cited.length ? "partly" : "no"));
  for (const v of res.json?.verdicts ?? []) {
    if (Number.isInteger(v.i) && v.i >= 0 && v.i < out.length && ["yes", "partly", "no"].includes(v.grounded)) out[v.i] = v.grounded;
  }
  return out;
}

export const SUPPORT_LABEL: Record<SupportLevel, string> = {
  high: "Well sourced",
  medium: "Partly sourced",
  low: "Unsourced",
};
