import Link from "next/link";
import { Badge, Card, CardTitle, LinkButton, ProgressRing } from "@/components/ui";
import { DOMAIN_LABELS } from "@/db/seed-data";
import {
  getDueFlashcardCount,
  getLessonForTask,
  getOpenReviewItemCount,
  getPlanProgress,
  getStudyDay,
  getTasksForDay,
} from "@/db/queries";
import { daysUntilExam, planDayFor, todayIso } from "@/lib/plan";
import { DayDoneToggle } from "@/components/day-done-toggle";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const today = todayIso();
  const dayNo = planDayFor(today);
  const [day, tasks, progress, due, openReviews] = await Promise.all([
    getStudyDay(dayNo),
    getTasksForDay(dayNo),
    getPlanProgress(),
    getDueFlashcardCount(new Date().toISOString()),
    getOpenReviewItemCount(),
  ]);
  const lessonsByTask = await Promise.all(tasks.map((t) => getLessonForTask(t.id)));
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  const untilExam = daysUntilExam(today);
  const primaryHref = tasks.length ? `/lesson/${tasks[0].id}` : "/practice";

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-4">
        <ProgressRing value={pct} label={`${dayNo}/47`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted">
            Day {dayNo} of 47 · {today}
          </p>
          <h1 className="text-lg font-semibold leading-snug">{day?.focus ?? "No plan entry"}</h1>
          <p className="mt-1 text-sm text-muted">
            {untilExam > 0 ? `${untilExam} days to the exam` : untilExam === 0 ? "Exam day." : "Exam date has passed"}
            {day ? (
              <>
                {" · "}
                <Badge tone="primary">{day.phase.replace("_", " ")}</Badge>
              </>
            ) : null}
          </p>
        </div>
      </header>

      <LinkButton href={primaryHref} className="w-full py-3 text-base">
        Start today&apos;s session
      </LinkButton>

      <Card>
        <CardTitle>1 · Lesson</CardTitle>
        {tasks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No ECO task is scheduled today — this is a review or mock day. See the focus above.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {tasks.map((t, i) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link href={`/lesson/${t.id}`} className="font-medium hover:underline">
                    {t.title}
                  </Link>
                  <p className="text-xs text-muted">
                    {DOMAIN_LABELS[t.domain]} · task {t.taskNumber} · domain is {t.weightPct}% of exam
                  </p>
                </div>
                {t.studied ? (
                  <Badge tone="success">studied</Badge>
                ) : lessonsByTask[i] ? (
                  <Badge tone="primary">ready</Badge>
                ) : (
                  <Badge>no lesson yet</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>2 · Practice set</CardTitle>
        <p className="mt-2 text-sm text-muted">
          Practice sets unlock in Phase 3, once the question bank exists.{" "}
          <Link href="/practice" className="text-primary underline">
            Open practice
          </Link>
        </p>
      </Card>

      <Card>
        <CardTitle>3 · Flashcards due</CardTitle>
        <p className="mt-2 text-sm">
          <span className="text-2xl font-semibold">{due}</span> <span className="text-muted">due now</span>
        </p>
      </Card>

      <Card>
        <CardTitle>4 · Review items</CardTitle>
        <p className="mt-2 text-sm">
          <span className="text-2xl font-semibold">{openReviews}</span> <span className="text-muted">open</span>
        </p>
      </Card>

      {day ? (
        <Card className="flex items-center justify-between">
          <div>
            <CardTitle>Day {day.day} done?</CardTitle>
            <p className="text-xs text-muted">Ticks the roadmap; the ring above tracks it.</p>
          </div>
          <DayDoneToggle day={day.day} done={day.done} />
        </Card>
      ) : null}
    </div>
  );
}
