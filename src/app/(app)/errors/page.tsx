import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/db/client";
import { questions, reviewItems, syllabusItems } from "@/db/schema";
import { getExamId } from "@/db/queries";
import { ResolveToggle } from "./resolve-toggle";
import { PMP } from "../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

/** Error log (build prompt §8.8): every review item, filterable by rule/family, with a resolve toggle. Day 43's read-through. */
export default async function ErrorsPage({ searchParams }: { searchParams: Promise<{ family?: string; show?: string }> }) {
  const sp = await searchParams;
  const examId = await getExamId();
  const rows = await db
    .select({ r: reviewItems, stem: questions.stem, task: syllabusItems.title, code: syllabusItems.code, domain: questions.domain })
    .from(reviewItems)
    .innerJoin(questions, eq(questions.id, reviewItems.questionId))
    .innerJoin(syllabusItems, eq(syllabusItems.id, questions.syllabusItemId))
    .where(and(eq(reviewItems.examId, examId), sp.family ? eq(reviewItems.distractorFamily, sp.family) : undefined, sp.show === "all" ? undefined : eq(reviewItems.resolved, false)))
    .orderBy(desc(reviewItems.createdAt));
  const counts = new Map<string, number>();
  for (const x of rows) if (x.r.distractorFamily) counts.set(x.r.distractorFamily, (counts.get(x.r.distractorFamily) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${rows.length} ${sp.show === "all" ? "items" : "open"}`}
        title="Error log"
        description="Each item carries the rule you broke. Resolve it once you can state the rule from memory and have answered a fresh question on it."
        actions={
          <Link href={sp.show === "all" ? "/errors" : "/errors?show=all"} className="text-sm text-accent hover:underline">
            {sp.show === "all" ? "Open only" : "Show resolved too"}
          </Link>
        }
      />
      <div className="flex flex-wrap gap-1.5">
        <Link href="/errors" className={`rounded-full border px-2.5 py-0.5 text-xs ${!sp.family ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-border text-fg-muted"}`}>
          all families
        </Link>
        {PMP.distractorFamilies.map((f) => (
          <Link key={f} href={`/errors?family=${f}${sp.show ? `&show=${sp.show}` : ""}`} className={`rounded-full border px-2.5 py-0.5 text-xs ${sp.family === f ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-border text-fg-muted"}`}>
            {f.replace(/_/g, " ")} {counts.get(f) ? `· ${counts.get(f)}` : ""}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here">Wrong answers you add from the review screen appear here with the rule you broke.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {rows.map(({ r, stem, task, code }) => (
            <li key={r.id}>
              <Card className={`p-4 ${r.resolved ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-fg-muted">
                      {r.createdAt.slice(0, 10)} · {code} · {task}
                    </p>
                    <p className="prose-reading mt-1 text-base">{stem}</p>
                    {r.distractorFamily ? (
                      <p className="mt-2 text-sm">
                        <Badge tone="incorrect" className="mr-2">
                          {PMP.familyRules[r.distractorFamily]?.label ?? r.distractorFamily}
                        </Badge>
                        <span className="text-fg-muted">{r.ruleBroken}</span>
                      </p>
                    ) : null}
                    {r.note ? <p className="mt-1 text-sm italic text-fg-muted">“{r.note}”</p> : null}
                  </div>
                  <ResolveToggle id={r.id} resolved={r.resolved} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
