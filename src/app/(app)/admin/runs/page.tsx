import { desc } from "drizzle-orm";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db } from "@/db/client";
import { generationRuns } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = await db.select().from(generationRuns).orderBy(desc(generationRuns.createdAt)).limit(100);
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Generation runs" description="Every indexing, lesson, question, QA, top-up and coaching run." />
      <Card className="divide-y divide-border">
        {runs.length === 0 ? <p className="p-4 text-sm text-fg-muted">No runs yet.</p> : null}
        {runs.map((r) => (
          <div key={r.id} className="grid gap-1 p-3 text-sm sm:grid-cols-[4rem_7rem_1fr_8rem_6rem]">
            <span className="tabular text-fg-muted">#{r.id}</span>
            <span>
              {r.kind}
              {r.syllabusItemId ? <span className="text-fg-muted"> · task {r.syllabusItemId}</span> : null}
            </span>
            <span className="truncate text-fg-muted">{r.log || r.paramsJson}</span>
            <span className="tabular text-fg-muted">
              {r.passed}/{r.produced}/{r.requested} · ${r.costUsd.toFixed(3)}
            </span>
            <Badge tone={r.status === "done" ? "correct" : r.status === "failed" ? "incorrect" : r.status === "running" ? "accent" : "neutral"} className="justify-self-start">
              {r.status}
            </Badge>
          </div>
        ))}
      </Card>
      <p className="mt-2 text-xs text-fg-muted">passed / produced / requested</p>
    </div>
  );
}
