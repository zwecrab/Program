/**
 * Generate + QA questions for one ECO task (build prompt §6.1, Phase 2 §18).
 *
 *   npm run generate:questions -- --task 23 --count 20
 *   npm run generate:questions -- --task 23 --count 120 --difficulty 2
 *
 * Prints per-question QA outcomes, the run's cost, and the ×26 extrapolation
 * (Phase 2 acceptance test 6). Runs on your machine with your .env.
 */
import "dotenv/config";
import { migrateAndSeed } from "../src/db/migrate";
import { validateModel } from "../src/lib/llm";
import { generateQuestionsForItem } from "../src/lib/generation/pipeline";
import { PMP } from "../config/exams/pmp";

function arg(name: string, def?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

async function main() {
  const task = Number(arg("task"));
  const count = Number(arg("count", "20"));
  const diffArg = arg("difficulty");
  const difficulty = diffArg ? (Number(diffArg) as 1 | 2 | 3) : null;
  if (!Number.isInteger(task) || task < 1 || task > 26) throw new Error("--task <1..26> is required");
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error("--count must be 1..200");

  await migrateAndSeed();
  await validateModel();

  console.log(`Generating ${count} question(s) for task ${task}${difficulty ? ` at difficulty ${difficulty}` : ""} with ${process.env.LLM_TRANSPORT === "mock" ? "MOCK transport" : process.env.OPENROUTER_MODEL}\n`);
  const t0 = Date.now();
  const r = await generateQuestionsForItem(task, { count, difficulty, ignoreCap: true, log: (l) => console.log(l) });
  const mins = ((Date.now() - t0) / 60000).toFixed(1);

  console.log(`\nRun #${r.runId}: ${r.active} active · ${r.quarantined} quarantined · ${r.failed} failed of ${r.requested} requested (${mins} min)`);
  console.log(`Cost: $${r.costUsd.toFixed(4)} → $${(r.costUsd / Math.max(1, r.active)).toFixed(4)} per active question`);
  const perTask = (r.costUsd / Math.max(1, r.active)) * PMP.bank.minPerItem;
  console.log(`Extrapolation: ${PMP.bank.minPerItem} active questions × 26 tasks ≈ $${(perTask * 26).toFixed(2)} (≈ $${perTask.toFixed(2)} per task)`);
  if (r.batchBias.problems.length) console.log(`Batch bias warnings:\n  - ${r.batchBias.problems.join("\n  - ")}`);
  console.log(`\nReview quarantined items at /admin/queue.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("generate-questions failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
