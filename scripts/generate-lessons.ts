/**
 * Generate the lesson (+12 flashcards) for one or all ECO tasks.
 *
 *   npm run generate:lessons -- --task 23
 *   npm run generate:lessons -- --all
 */
import "dotenv/config";
import { migrateAndSeed } from "../src/db/migrate";
import { validateModel } from "../src/lib/llm";
import { generateLesson, SECTION_KEYS } from "../src/lib/generation/lessons";
import { startRun, finishRun } from "../src/lib/generation/pipeline";
import { getEcoTasks } from "../src/db/queries";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  await migrateAndSeed();
  await validateModel();
  const all = process.argv.includes("--all");
  const task = Number(arg("task"));
  const ids = all ? (await getEcoTasks()).map((t) => t.id) : [task];
  if (!all && !(Number.isInteger(task) && task >= 1 && task <= 26)) throw new Error("--task <1..26> or --all");

  let total = 0;
  for (const id of ids) {
    const runId = await startRun("lesson", id, {});
    try {
      const r = await generateLesson(id, { runId, ignoreCap: true });
      total += r.costUsd;
      await finishRun(runId, { status: "done", requested: 1, produced: 1, passed: r.support.support === "low" ? 0 : 1, costUsd: r.costUsd, log: `lesson #${r.lessonId} v${r.version} support=${r.support.support}` });
      console.log(`✓ task ${id}: lesson #${r.lessonId} v${r.version} — support ${r.support.support}, ${r.flashcards} flashcards, $${r.costUsd.toFixed(4)}`);
      for (const k of SECTION_KEYS) console.log(`    ${k.padEnd(11)} ${r.perSection[k].support.padEnd(6)} sim=${r.perSection[k].retrieval_score.toFixed(2)} chunks=${r.perSection[k].chunk_agreement} grounded=${r.perSection[k].is_grounded}`);
      if (r.plagiarismHits.length) console.log(`    ! 25-word rule: ${r.plagiarismHits.map((p) => `${p.section} (${p.run} words)`).join(", ")} — lesson marked low support; regenerate or edit.`);
    } catch (err) {
      await finishRun(runId, { status: "failed", log: String(err instanceof Error ? err.message : err) });
      console.error(`✗ task ${id}: ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\nTotal cost $${total.toFixed(4)}${all ? "" : ` → ×26 ≈ $${(total * 26).toFixed(2)}`}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("generate-lessons failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
