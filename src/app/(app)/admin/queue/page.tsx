import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db/client";
import { questions, syllabusItems } from "@/db/schema";
import { QueueActions } from "./queue-actions";
import type { QaRecord } from "@/lib/generation/qa";

export const dynamic = "force-dynamic";

export default async function QueuePage({ searchParams }: { searchParams: Promise<{ task?: string; status?: string }> }) {
  const sp = await searchParams;
  const task = Number(sp.task);
  const statusFilter = sp.status === "all" ? ["active", "qa_pending", "quarantined", "failed", "retired"] : sp.status ? [sp.status] : ["quarantined", "failed", "qa_pending"];
  const rows = await db
    .select({ q: questions, title: syllabusItems.title, code: syllabusItems.code })
    .from(questions)
    .innerJoin(syllabusItems, eq(syllabusItems.id, questions.syllabusItemId))
    .where(and(inArray(questions.status, statusFilter as never), Number.isInteger(task) && task > 0 ? eq(questions.syllabusItemId, task) : undefined))
    .orderBy(desc(questions.createdAt))
    .limit(200);

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="QA review queue"
        description="Approve, edit or bin anything the pipeline quarantined. Approving by hand overrides the reviewer."
        actions={
          <div className="flex gap-1 text-xs">
            {[
              ["", "needs review"],
              ["active", "active"],
              ["all", "all"],
            ].map(([v, label]) => (
              <Link key={v} href={`/admin/queue?${new URLSearchParams({ ...(task ? { task: String(task) } : {}), ...(v ? { status: v } : {}) })}`} className={`rounded-md px-2 py-1 ${(sp.status ?? "") === v ? "bg-accent-soft text-accent-soft-fg" : "text-fg-muted hover:text-fg"}`}>
                {label}
              </Link>
            ))}
          </div>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="Nothing waiting">Generated questions that fail QA land here.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ q, title, code }) => {
            const qa = q.qaJson ? (JSON.parse(q.qaJson) as Partial<QaRecord>) : null;
            const reasons = [...(qa?.deterministic?.problems ?? []), ...(qa?.review?.reasons ?? [])];
            return (
              <li key={q.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    <span className="tabular">#{q.id}</span>
                    <Badge tone={q.status === "active" ? "correct" : q.status === "qa_pending" ? "warn" : "incorrect"}>{q.status}</Badge>
                    <Badge>{q.itemType}</Badge>
                    <Badge>d{q.difficulty}</Badge>
                    <Badge>{q.style}</Badge>
                    <Badge>{q.deliveryApproach}</Badge>
                    <span>
                      {code} · {title}
                    </span>
                    {q.support ? <Badge tone={q.support === "high" ? "correct" : q.support === "medium" ? "warn" : "incorrect"}>{q.support}</Badge> : null}
                  </div>
                  <p className="prose-reading mt-2 text-base">{q.stem}</p>
                  {reasons.length ? (
                    <ul className="mt-2 list-disc pl-5 text-sm text-incorrect">
                      {reasons.slice(0, 4).map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <QueueActions id={q.id} status={q.status} />
                    <Link href={`/admin/queue/${q.id}`} className="text-sm text-accent hover:underline">
                      Open editor →
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
