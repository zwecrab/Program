import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimits, passphraseMatches, rateLimit } from "@/lib/auth";
import { missingRequiredEnv, redactSecrets } from "@/lib/env";
import { questionInputSchema, containsAbsolute } from "@/lib/question-schema";

describe("passphrase", () => {
  it("matches only the exact passphrase", () => {
    expect(passphraseMatches("correct horse", "correct horse")).toBe(true);
    expect(passphraseMatches("correct hors", "correct horse")).toBe(false);
    expect(passphraseMatches("", "")).toBe(false);
  });
});

describe("rate limit", () => {
  beforeEach(() => _resetRateLimits());
  it("allows up to max then blocks until the window resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t0).ok).toBe(true);
    expect(rateLimit("k", 3, 1000, t0 + 10).ok).toBe(false);
    expect(rateLimit("k", 3, 1000, t0 + 1001).ok).toBe(true);
  });
});

describe("env", () => {
  it("lists missing required variables", () => {
    expect(missingRequiredEnv({ OPENROUTER_API_KEY: "x", APP_PASSPHRASE: "", SESSION_SECRET: "y" } as unknown as NodeJS.ProcessEnv)).toEqual([
      "APP_PASSPHRASE",
    ]);
  });
  it("redacts OpenRouter keys from text", () => {
    const k = ["sk", "or", "v1-abcdef123"].join("-");
    expect(redactSecrets(`failed with ${k} today`)).toBe(`failed with ${k.slice(0, 6)}[redacted] today`);
  });
});

describe("question schema", () => {
  const base = {
    eco_task_id: 23,
    domain: "business_environment",
    delivery_approach: "predictive",
    item_type: "single",
    difficulty: 2,
    style: "first",
    stem: "A key supplier says a component may arrive two weeks late. What should the project manager do first?",
    explanation_md: "",
    pmbok_ref: "Guide §2.7",
    options: [
      { label: "A", body: "Analyse the impact on the schedule and update the risk register.", is_correct: true, distractor_family: null, rationale: "ARA: analyse first; 'may' = risk." },
      { label: "B", body: "Escalate to the sponsor.", is_correct: false, distractor_family: "escalate_prematurely", rationale: "Not the PM's first move." },
      { label: "C", body: "Log it in the issue log and take corrective action.", is_correct: false, distractor_family: "risk_issue_confusion", rationale: "'May' means it has not happened." },
      { label: "D", body: "Wait to see whether the delay materialises.", is_correct: false, distractor_family: "wait_or_defer", rationale: "Passive." },
    ],
  };
  it("accepts a well-formed single-answer question", () => {
    expect(questionInputSchema.safeParse(base).success).toBe(true);
  });
  it("rejects a wrong option without a distractor family", () => {
    const bad = { ...base, options: base.options.map((o, i) => (i === 1 ? { ...o, distractor_family: null } : o)) };
    expect(questionInputSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects a single item with two correct options", () => {
    const bad = { ...base, options: base.options.map((o, i) => (i === 1 ? { ...o, is_correct: true, distractor_family: null } : o)) };
    expect(questionInputSchema.safeParse(bad).success).toBe(false);
  });
  it("detects absolutes", () => {
    expect(containsAbsolute("Always escalate to the sponsor.")).toBe(true);
    expect(containsAbsolute("Analyse the impact first.")).toBe(false);
  });
});
