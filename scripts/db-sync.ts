/**
 * One-command DB sync between the local SQLite file and Turso (build prompt §12).
 *
 *   npm run db:push   # local  → Turso   (ship the bank you generated locally)
 *   npm run db:pull   # Turso  → local   (bring attempts made on your phone back)
 *
 * Reads DATABASE_URL (local file) and TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 * from .env. Copies every table except source_chunks (§17.5: extracted PMI
 * text never leaves your machine) — the deployed app serves the bank, and
 * retrieval-backed features (ask, explain) are local-only by design.
 *
 * Whole-table replace inside one transaction on the destination.
 */
import "dotenv/config";
import { createClient, type Client, type InValue } from "@libsql/client";

const direction = process.argv[2];
if (direction !== "push" && direction !== "pull") {
  console.error("usage: tsx scripts/db-sync.ts <push|pull>");
  process.exit(1);
}

const local = createClient({ url: process.env.DATABASE_URL || "file:./data/pmp.db" });
const remoteUrl = process.env.TURSO_DATABASE_URL;
if (!remoteUrl) {
  console.error("TURSO_DATABASE_URL is not set in .env (e.g. libsql://pmp-trainer-<you>.turso.io)");
  process.exit(1);
}
const remote = createClient({ url: remoteUrl, authToken: process.env.TURSO_AUTH_TOKEN });

const TABLES = [
  "exams",
  "syllabus_items",
  "study_days",
  "lessons",
  "flashcards",
  "questions",
  "options",
  "case_studies",
  "case_questions",
  "sessions",
  "attempts",
  "review_items",
  "explanations",
  "coaching_summaries",
  "generation_runs",
  "llm_usage",
  "settings",
];

async function copy(from: Client, to: Client) {
  // Make sure the destination has the schema: run migrations there first.
  const { drizzle } = await import("drizzle-orm/libsql");
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  await migrate(drizzle(to), { migrationsFolder: "./drizzle" });

  await to.execute("PRAGMA foreign_keys=OFF");
  for (const t of TABLES) {
    const rows = await from.execute(`SELECT * FROM ${t}`);
    const cols = rows.columns;
    const stmts = [{ sql: `DELETE FROM ${t}`, args: [] as InValue[] }];
    for (const r of rows.rows) {
      stmts.push({ sql: `INSERT INTO ${t} (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`, args: cols.map((c) => r[c] as InValue) });
    }
    await to.batch(stmts, "write");
    console.log(`  ${t.padEnd(20)} ${rows.rows.length} rows`);
  }
  await to.execute("PRAGMA foreign_keys=ON");
}

(direction === "push" ? copy(local, remote) : copy(remote, local))
  .then(() => {
    console.log(`\n${direction === "push" ? "Pushed local → Turso" : "Pulled Turso → local"}. source_chunks were not copied (they stay on this machine).`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("db-sync failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
