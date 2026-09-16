import { timingSafeEqual } from "node:crypto";

/** Constant-time passphrase comparison; never leaks length via early exit. */
export function passphraseMatches(candidate: string, expected: string): boolean {
  if (!expected) return false;
  const a = Buffer.from(candidate.normalize("NFKC"), "utf8");
  const b = Buffer.from(expected.normalize("NFKC"), "utf8");
  if (a.length !== b.length) {
    // still burn a comparison so timing is uniform
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Minimal in-memory rate limiter (per process). Enough for a single-user
 * app: it stops a script hammering the login or LLM routes.
 */
interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterMs: number } {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  if (b.count >= max) return { ok: false, retryAfterMs: b.resetAt - now };
  b.count += 1;
  return { ok: true, retryAfterMs: 0 };
}

export function _resetRateLimits() {
  buckets.clear();
}
