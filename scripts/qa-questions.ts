/**
 * Re-run QA over stored questions (build prompt §7). Useful after hand edits
 * in the admin queue or after changing the mindset rules.
 *
 *   npm run qa:questions -- --task 23            # qa_pending + quarantined for one task
 *   npm run qa:questions -- --task 23 --all      # every question of the task, active included
 *   npm run qa:questions -- --id 123
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db/client";
import { questions } from "../src/db/schema";
import { migrateAndSeed } from "../src/db/migrate";
import { validateModel } from "../src/lib/llm";
import { getEcoTask } from "../src/db/queries";
import { loadBankStems, loadQuestionInput, loadSourceTexts } from "../src/lib/generation/qa";
import { qaOne, startRun, finishRun } from "../src/lib/generation/pipeline";
import { retrieveForQuestions } from "../src/lib/generation/questions";
import { computeSupport } from "../src/lib/generation/support";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  await migrateAndSeed();
  await validateModel();
  const task = Number(arg("task"));
  const id = Number(arg("id"));
  const all = process.argv.includes("--all");

  const rows = Number.isInteger(id) && id > 0
    ? await db.select().from(questions).where(eq(questions.id, id))
    : await db
        .select()
        .from(questions)
        .where(and(eq(questions.syllabusItemId, task), all ? undefined : inArray(questions.status, ["qa_pending", "quarantined", "failed"])));
  if (!rows.length) {
    console.log("Nothing to QA.");
    return;
  }
  const itemId = rows[0].syllabusItemId;
  const item = await getEcoTask(itemId);
  if (!item) throw new Error("item not found");
  const runId = await startRun("qa", itemId, { ids: rows.map((r) => r.id) });
  const sourceTexts = await loadSourceTexts();
  const chunks = await retrieveForQuestions(item);
  let cost = 0;
  let passed = 0;
  for (const row of rows) {
    const input = await loadQuestionInput(row.id);
    if (!input) continue;
    const cites = (JSON.parse(row.citationsJson ?? "[]") as Array<{ chunk_id: number }>).map((c) => chunks.findIndex((ch) => ch.id === c.chunk_id) + 1).filter((n) => n > 0);
    const g = { input, cites, raw: input, support: computeSupport([], "partly") };
    const { record, costUsd } = await qaOne(row.id, g, item, chunks, { bankStems: await loadBankStems(itemId, row.id), sourceTexts }, { runId, ignoreCap: true });
    cost += costUsd;
    if (record.final === "active") passed++;
    console.log(`  ${record.final === "active" ? "✓" : "?"} #${row.id} ${record.final}${record.review?.reasons?.length ? " — " + record.review.reasons.join("; ").slice(0, 120) : ""}`);
  }
  await finishRun(runId, { status: "done", requested: rows.length, produced: rows.length, passed, costUsd: cost, log: `${passed}/${rows.length} active` });
  console.log(`\n${passed}/${rows.length} active · $${cost.toFixed(4)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("qa-questions failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
