import { and, asc, eq, sql } from "drizzle-orm";
import { Card, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui";
import { db } from "@/db/client";
import { flashcards, syllabusItems } from "@/db/schema";
import { getExamId } from "@/db/queries";
import { previewIntervals } from "@/lib/fsrs";
import { FlashcardDeck } from "./deck";
import { getT } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<{ task?: string; all?: string }> }) {
  const t = await getT();
  const sp = await searchParams;
  const examId = await getExamId();
  const task = Number(sp.task) || null;
  const now = new Date().toISOString();
  const conds = [eq(flashcards.examId, examId)];
  if (task) conds.push(eq(flashcards.syllabusItemId, task));
  if (!sp.all) conds.push(sql`${flashcards.dueAt} <= ${now}`);
  const due = await db
    .select({ card: flashcards, taskCode: syllabusItems.code, taskTitle: syllabusItems.title })
    .from(flashcards)
    .innerJoin(syllabusItems, eq(syllabusItems.id, flashcards.syllabusItemId))
    .where(and(...conds))
    .orderBy(asc(flashcards.dueAt))
    .limit(60);
  const [totals] = await db
    .select({ total: sql<number>`count(*)`, due: sql<number>`sum(case when ${flashcards.dueAt} <= ${now} then 1 else 0 end)`, learned: sql<number>`sum(case when ${flashcards.fsrsState} = 2 then 1 else 0 end)` })
    .from(flashcards)
    .where(eq(flashcards.examId, examId));

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="FSRS-scheduled" title={t("cards.title")} description={task ? `Task ${task} only` : "Everything due now, oldest first."} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Due now" value={Number(totals?.due ?? 0)} />
        <Stat label="Total cards" value={Number(totals?.total ?? 0)} hint="12 per generated lesson" />
        <Stat label="In review state" value={Number(totals?.learned ?? 0)} />
      </div>
      {due.length === 0 ? (
        <EmptyState title={Number(totals?.total ?? 0) === 0 ? "No flashcards yet" : "Nothing due"}>
          {Number(totals?.total ?? 0) === 0 ? (
            <>
              Cards come from generated lessons: <code>npm run generate:lessons -- --task 23</code>.
            </>
          ) : (
            <a href="/flashcards?all=1" className="text-accent hover:underline">
              Review ahead anyway →
            </a>
          )}
        </EmptyState>
      ) : (
        <FlashcardDeck
          cards={due.map((d) => ({ id: d.card.id, front: d.card.front, back: d.card.back, cardType: d.card.cardType, task: `${d.taskCode} · ${d.taskTitle}`, intervals: previewIntervals(d.card) }))}
          labels={{ again: t("cards.again"), hard: t("cards.hard"), good: t("cards.good"), easy: t("cards.easy"), show: t("cards.show") }}
        />
      )}
      <Card className="p-4 text-sm text-fg-muted">
        <CardTitle>How grading works</CardTitle>
        <p className="mt-1">Again = forgot · Hard = recalled with effort · Good = recalled · Easy = trivial. FSRS sets the next review from your history; the interval each button would give is shown on it.</p>
      </Card>
    </div>
  );
}
