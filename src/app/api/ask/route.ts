import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ask } from "@/lib/generation/runtime";
import { LlmCapExceeded } from "@/lib/llm";
import { rateLimit } from "@/lib/auth";
import { redactSecrets } from "@/lib/env";

export const runtime = "nodejs";

const body = z.object({ question: z.string().trim().min(3).max(1000), syllabusItemId: z.number().int().nullable().optional() });

/** Lesson "ask a follow-up" (build prompt §8.2; Phase 2 acceptance tests 2–3). Capped, rate-limited, grounded. */
export async function POST(req: NextRequest) {
  const rl = rateLimit("ask", 30, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many questions this hour." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const r = await ask(parsed.data.question, { syllabusItemId: parsed.data.syllabusItemId ?? null });
    return NextResponse.json(r);
  } catch (err) {
    if (err instanceof LlmCapExceeded) return NextResponse.json({ error: err.message, cap: true }, { status: 402 });
    return NextResponse.json({ error: redactSecrets(err instanceof Error ? err.message : "failed") }, { status: 500 });
  }
}
