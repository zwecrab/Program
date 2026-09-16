import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { db } from "@/db/client";
import { options, questions, syllabusItems } from "@/db/schema";
import { QuestionEditor } from "./editor";
import { QueueActions } from "../queue-actions";
import { CitationStrip } from "@/components/citations";
import type { QaRecord } from "@/lib/generation/qa";

export const dynamic = "force-dynamic";

export default async function QueueItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const qid = Number(id);
  const [q] = await db.select().from(questions).where(eq(questions.id, qid)).limit(1);
  if (!q) notFound();
  const [item] = await db.select().from(syllabusItems).where(eq(syllabusItems.id, q.syllabusItemId)).limit(1);
  const opts = await db.select().from(options).where(eq(options.questionId, qid)).orderBy(options.label);
  const qa = q.qaJson ? (JSON.parse(q.qaJson) as Partial<QaRecord>) : null;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={`Question #${q.id} · ${item?.code} ${item?.title}`} title="Edit question" actions={<QueueActions id={q.id} status={q.status} />} />
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone={q.status === "active" ? "correct" : "incorrect"}>{q.status}</Badge>
        <Badge>{q.itemType}</Badge>
        <Badge>{q.deliveryApproach}</Badge>
        <Badge>{q.style}</Badge>
        {q.support ? <Badge tone={q.support === "high" ? "correct" : q.support === "medium" ? "warn" : "incorrect"}>{q.support}</Badge> : null}
      </div>

      {qa ? (
        <Card className="p-4 text-sm">
          <CardTitle>QA record</CardTitle>
          {qa.deterministic ? (
            <p className="mt-1">
              Deterministic: {qa.deterministic.ok ? <span className="text-correct">ok</span> : <span className="text-incorrect">{qa.deterministic.problems.join("; ")}</span>}
              {qa.deterministic.longestSourceRun ? <span className="text-fg-muted"> · longest source run {qa.deterministic.longestSourceRun} words</span> : null}
            </p>
          ) : null}
          {qa.review ? (
            <div className="mt-1">
              Reviewer: <strong>{qa.review.verdict}</strong>
              {qa.review.reasons.length ? <ul className="list-disc pl-5 text-fg-muted">{qa.review.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
              {qa.review.fix_hint ? <p className="text-fg-muted">Hint: {qa.review.fix_hint}</p> : null}
            </div>
          ) : null}
          {qa.revised ? <p className="mt-1 text-fg-muted">Revised once by the pipeline.</p> : null}
        </Card>
      ) : null}

      <QuestionEditor
        question={{
          id: q.id,
          stem: q.stem,
          explanation_md: q.explanationMd,
          pmbok_ref: q.pmbokRef ?? "",
          difficulty: q.difficulty,
          item_type: q.itemType,
          exhibit_json: q.exhibitJson ?? "",
          options: opts.map((o) => ({ body: o.body, is_correct: o.isCorrect, distractor_family: o.distractorFamily ?? "", rationale: o.rationale })),
        }}
      />
      {q.citationsJson ? <CitationStrip citations={JSON.parse(q.citationsJson)} support={q.support} /> : null}
    </div>
  );
}
