import { NextResponse } from "next/server";
import { explainDifferently } from "@/lib/generation/runtime";
import { LlmCapExceeded } from "@/lib/llm";
import { redactSecrets } from "@/lib/env";

export const runtime = "nodejs";

/** "Explain this differently" — one call per question, cached against question_id (build prompt §6.4). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const qid = Number(id);
  if (!Number.isInteger(qid)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    return NextResponse.json(await explainDifferently(qid));
  } catch (err) {
    if (err instanceof LlmCapExceeded) return NextResponse.json({ error: err.message }, { status: 402 });
    return NextResponse.json({ error: redactSecrets(err instanceof Error ? err.message : "failed") }, { status: 500 });
  }
}
