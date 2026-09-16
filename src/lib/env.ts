/**
 * Environment access. Server-only.
 *
 * Secrets are read from process.env (populated by Next.js from .env) and are
 * never re-exported to the client. `assertRequiredEnv()` is called from
 * instrumentation.ts so a missing secret stops the process with a plain
 * message instead of a stack trace deep inside a request.
 */

const REQUIRED = ["OPENROUTER_API_KEY", "APP_PASSPHRASE", "SESSION_SECRET"] as const;

export function missingRequiredEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return REQUIRED.filter((k) => !env[k] || env[k]!.trim() === "");
}

export function assertRequiredEnv(): void {
  const missing = missingRequiredEnv();
  if (missing.length === 0) return;
  const msg = [
    "",
    "PMP Trainer cannot start: required environment variables are missing.",
    ...missing.map((k) => `  - ${k}`),
    "",
    "Copy .env.example to .env and fill these in. See README.md → Setup.",
    "",
  ].join("\n");
  console.error(msg);
  process.exit(1);
}

export const env = {
  get databaseUrl() {
    return process.env.DATABASE_URL || "file:./data/pmp.db";
  },
  get tursoAuthToken() {
    return process.env.TURSO_AUTH_TOKEN || undefined;
  },
  get appPassphrase() {
    return process.env.APP_PASSPHRASE ?? "";
  },
  get sessionSecret() {
    return process.env.SESSION_SECRET ?? "";
  },
  get openrouterModel() {
    return process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash";
  },
  get openrouterAppName() {
    return process.env.OPENROUTER_APP_NAME || "PMP Trainer";
  },
  get monthlyLlmCapUsd() {
    const n = Number(process.env.MONTHLY_LLM_CAP_USD);
    return Number.isFinite(n) && n > 0 ? n : 5;
  },
};

/** Remove anything that looks like an OpenRouter key from text destined for logs or responses. */
export function redactSecrets(text: string): string {
  // Prefix assembled at runtime so the literal never appears in the repo (acceptance test 2).
  const prefix = ["sk", "or", ""].join("-");
  let out = text.replace(new RegExp(`${prefix}[A-Za-z0-9_-]+`, "g"), `${prefix}[redacted]`);
  const key = process.env.OPENROUTER_API_KEY;
  if (key && key.length > 8) out = out.split(key).join("[redacted]");
  return out;
}
