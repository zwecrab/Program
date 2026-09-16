/**
 * Server-side OpenRouter client. The browser never talks to OpenRouter.
 *
 * - Model slug from OPENROUTER_MODEL; validated against /api/v1/models at
 *   startup (`validateModel`). A 404 lists three cheap alternatives and exits.
 * - Every call writes an llm_usage row with token counts and computed cost.
 * - Monthly cap from settings.monthly_llm_cap_usd: runtime calls stop at 100%.
 * - LLM_TRANSPORT=mock routes to src/lib/llm-mock.ts for tests/offline dev.
 */
import { and, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { llmUsage, settings } from "@/db/schema";
import { env, redactSecrets } from "@/lib/env";
import { eq } from "drizzle-orm";

export type LlmPurpose =
  | "lesson"
  | "questions"
  | "question_revise"
  | "qa_review"
  | "grounding"
  | "explain"
  | "ask"
  | "coaching"
  | "validate";

export interface ChatRequest {
  purpose: LlmPurpose;
  system: string;
  user: string;
  /** Ask for a JSON object; the response is parsed and returned in `json`. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  runId?: number | null;
  examId?: number | null;
  /** Batch scripts pass true to keep generating past the runtime cap (the cap protects runtime spend). */
  ignoreCap?: boolean;
}

export interface ChatResponse<T = unknown> {
  text: string;
  json: T | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export class LlmCapExceeded extends Error {
  constructor(public spent: number, public cap: number) {
    super(`Monthly LLM cap reached ($${spent.toFixed(2)} of $${cap.toFixed(2)}). Runtime generation is paused; the app serves the existing bank.`);
  }
}

interface Pricing {
  prompt: number; // USD per token
  completion: number;
}

const FALLBACK_PRICING: Pricing = { prompt: 0.05 / 1e6, completion: 0.14 / 1e6 };
let pricingCache: { model: string; pricing: Pricing } | null = null;

const BASE = "https://openrouter.ai/api/v1";

function headers() {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": env.openrouterAppName,
  };
}

interface ModelRow {
  id: string;
  name?: string;
  pricing?: { prompt?: string; completion?: string };
  context_length?: number;
}

export async function fetchModels(): Promise<ModelRow[]> {
  const res = await fetch(`${BASE}/models`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`OpenRouter /models returned ${res.status}`);
  const body = (await res.json()) as { data: ModelRow[] };
  return body.data ?? [];
}

/**
 * Startup check (build prompt §2). Returns true when the slug exists. On a
 * missing slug: prints three cheap alternatives and exits. On a network
 * failure: warns and continues — the app must still boot offline.
 */
export async function validateModel(opts: { exitOnMissing?: boolean } = {}): Promise<boolean> {
  if (process.env.LLM_TRANSPORT === "mock") return true;
  const slug = env.openrouterModel;
  let models: ModelRow[];
  try {
    models = await fetchModels();
  } catch (err) {
    console.warn(`[llm] could not reach OpenRouter to validate OPENROUTER_MODEL=${slug}: ${redactSecrets(String(err))}`);
    return true;
  }
  const hit = models.find((m) => m.id === slug);
  if (hit) {
    const p = hit.pricing;
    if (p?.prompt && p?.completion) pricingCache = { model: slug, pricing: { prompt: Number(p.prompt), completion: Number(p.completion) } };
    return true;
  }
  const cheap = models
    .filter((m) => m.pricing?.prompt && Number(m.pricing.prompt) > 0 && (m.context_length ?? 0) >= 64_000)
    .sort((a, b) => Number(a.pricing!.prompt) - Number(b.pricing!.prompt))
    .slice(0, 3)
    .map((m) => `  - ${m.id}  ($${(Number(m.pricing!.prompt) * 1e6).toFixed(3)} in / $${(Number(m.pricing!.completion) * 1e6).toFixed(3)} out per 1M tokens)`);
  console.error(
    [
      "",
      `OPENROUTER_MODEL="${slug}" was not found on OpenRouter (GET /api/v1/models).`,
      "Three cheap alternatives with ≥64k context:",
      ...cheap,
      "",
      "Set OPENROUTER_MODEL in .env to one of these and restart. Not falling back silently.",
      "",
    ].join("\n"),
  );
  if (opts.exitOnMissing !== false) process.exit(1);
  return false;
}

async function pricingFor(model: string): Promise<Pricing> {
  if (pricingCache?.model === model) return pricingCache.pricing;
  try {
    const m = (await fetchModels()).find((x) => x.id === model);
    if (m?.pricing?.prompt && m.pricing.completion) {
      pricingCache = { model, pricing: { prompt: Number(m.pricing.prompt), completion: Number(m.pricing.completion) } };
      return pricingCache.pricing;
    }
  } catch {
    /* offline: use fallback */
  }
  return FALLBACK_PRICING;
}

export function monthStartIso(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
}

export async function monthlySpend(): Promise<{ spent: number; cap: number }> {
  const [row] = await db
    .select({ usd: sql<number>`coalesce(sum(${llmUsage.costUsd}), 0)` })
    .from(llmUsage)
    .where(and(gte(llmUsage.calledAt, monthStartIso())));
  const [capRow] = await db.select().from(settings).where(eq(settings.key, "monthly_llm_cap_usd")).limit(1);
  const cap = Number(capRow?.value ?? env.monthlyLlmCapUsd) || env.monthlyLlmCapUsd;
  return { spent: Number(row?.usd ?? 0), cap };
}

/** Throws LlmCapExceeded at 100%; returns the ratio so the UI can warn at 80%. */
export async function assertUnderCap(): Promise<number> {
  const { spent, cap } = await monthlySpend();
  if (spent >= cap) throw new LlmCapExceeded(spent, cap);
  return spent / cap;
}

export function parseJsonLoose<T = unknown>(text: string): T | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function chat<T = unknown>(req: ChatRequest): Promise<ChatResponse<T>> {
  if (!req.ignoreCap) await assertUnderCap();
  const model = env.openrouterModel;

  let text: string;
  let promptTokens = 0;
  let completionTokens = 0;

  if (process.env.LLM_TRANSPORT === "mock") {
    const { mockRespond } = await import("./llm-mock");
    const r = await mockRespond(req);
    text = r.text;
    promptTokens = Math.ceil((req.system.length + req.user.length) / 4);
    completionTokens = Math.ceil(text.length / 4);
  } else {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
    const body = {
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      temperature: req.temperature ?? (req.json ? 0.4 : 0.7),
      max_tokens: req.maxTokens ?? 4000,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
    };
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const errText = redactSecrets(await res.text().catch(() => ""));
      throw new Error(`OpenRouter ${res.status} for ${req.purpose}: ${errText.slice(0, 400)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    text = data.choices?.[0]?.message?.content ?? "";
    promptTokens = data.usage?.prompt_tokens ?? Math.ceil((req.system.length + req.user.length) / 4);
    completionTokens = data.usage?.completion_tokens ?? Math.ceil(text.length / 4);
  }

  const pricing = process.env.LLM_TRANSPORT === "mock" ? FALLBACK_PRICING : await pricingFor(model);
  const costUsd = promptTokens * pricing.prompt + completionTokens * pricing.completion;
  await db.insert(llmUsage).values({
    examId: req.examId ?? null,
    purpose: req.purpose,
    model,
    promptTokens,
    completionTokens,
    costUsd,
    runId: req.runId ?? null,
  });

  return { text, json: req.json ? parseJsonLoose<T>(text) : null, model, promptTokens, completionTokens, costUsd };
}
