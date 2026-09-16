#!/usr/bin/env bash
# Deploy to Vercel + Turso (build prompt §12). Run from the project root on your machine.
# Requires: `npm i -g vercel`, `turso` CLI logged in, and .env filled in.
set -euo pipefail

if [ ! -f .env ]; then echo ".env missing — copy .env.example first"; exit 1; fi
set -a; source .env; set +a

: "${TURSO_DATABASE_URL:?Set TURSO_DATABASE_URL in .env (turso db create pmp-trainer && turso db show pmp-trainer --url)}"
: "${TURSO_AUTH_TOKEN:?Set TURSO_AUTH_TOKEN in .env (turso db tokens create pmp-trainer)}"

echo "1/4  Checks"
npm run typecheck && npm run lint && npm test

echo "2/4  Push schema + data to Turso"
npx tsx scripts/db-sync.ts push

echo "3/4  Vercel environment variables"
for k in OPENROUTER_API_KEY OPENROUTER_MODEL OPENROUTER_APP_NAME APP_PASSPHRASE SESSION_SECRET TURSO_AUTH_TOKEN MONTHLY_LLM_CAP_USD; do
  v="${!k:-}"
  if [ -n "$v" ]; then printf '%s' "$v" | vercel env add "$k" production --force >/dev/null 2>&1 || true; fi
done
printf '%s' "$TURSO_DATABASE_URL" | vercel env add DATABASE_URL production --force >/dev/null 2>&1 || true
printf '%s' "fake" | vercel env add EMBEDDINGS production --force >/dev/null 2>&1 || true   # no source_chunks in prod → retrieval disabled there

echo "4/4  Deploy"
vercel --prod

echo
echo "Done. Practice, flashcards, analytics and mocks work from any device."
echo "Retrieval-backed features (lesson 'ask', 'explain differently') stay local: the PMI text is never uploaded."
