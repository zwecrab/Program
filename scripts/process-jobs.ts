/**
 * Drain the generation queue: queued `topup` runs (created when an item's
 * unseen pool drops below the threshold) and queued `questions` runs from
 * the admin page. Run it whenever you like; it is safe to re-run.
 *
 *   npm run jobs
 */
import "dotenv/config";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../src/db/client";
import { generationRuns } from "../src/db/schema";
import { migrateAndSeed } from "../src/db/migrate";
import { validateModel } from "../src/lib/llm";
import { generateQuestionsForItem } from "../src/lib/generation/pipeline";

async function main() {
  await migrateAndSeed();
  await validateModel();
  const queued = await db
    .select()
    .from(generationRuns)
    .where(inArray(generationRuns.status, ["queued"]))
    .orderBy(asc(generationRuns.createdAt));
  if (!queued.length) {
    console.log("Queue is empty.");
    return;
  }
  for (const run of queued) {
    if (!run.syllabusItemId || !["topup", "questions"].includes(run.kind)) continue;
    const params = JSON.parse(run.paramsJson ?? "{}") as { count?: number; difficulty?: 1 | 2 | 3 | null };
    await db.update(generationRuns).set({ status: "running", startedAt: new Date().toISOString() }).where(eq(generationRuns.id, run.id));
    console.log(`▶ run #${run.id} (${run.kind}) task ${run.syllabusItemId} × ${params.count ?? 20}`);
    try {
      const r = await generateQuestionsForItem(run.syllabusItemId, { count: params.count ?? 20, difficulty: params.difficulty ?? null, runId: run.id, ignoreCap: false, log: (l) => console.log(l) });
      console.log(`  → ${r.active} active, ${r.quarantined} quarantined, ${r.failed} failed, $${r.costUsd.toFixed(4)}`);
    } catch (err) {
      console.error(`  ✗ ${err instanceof Error ? err.message : err}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("process-jobs failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
