import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Card, CardTitle, LinkButton, ProgressRing } from "@/components/ui";
import { DOMAIN_LABELS } from "@/db/seed-data";
import { getDueFlashcardCount, getLessonForTask, getOpenReviewItemCount, getPlanProgress, getStudyDay, getTasksForDay, getTaskStudiedCount } from "@/db/queries";
import { daysUntilExam, planDayFor, todayIso } from "@/lib/plan";
import { DayDoneToggle } from "@/components/day-done-toggle";
import { getT } from "@/lib/settings";
import { PMP } from "../../../config/exams/pmp";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const t = await getT();
  const today = todayIso();
  const dayNo = planDayFor(today);
  const [day, tasks, progress, due, openReviews, studied] = await Promise.all([
    getStudyDay(dayNo),
    getTasksForDay(dayNo),
    getPlanProgress(),
    getDueFlashcardCount(new Date().toISOString()),
    getOpenReviewItemCount(),
    getTaskStudiedCount(),
  ]);
  const lessonsByTask = await Promise.all(tasks.map((x) => getLessonForTask(x.id)));
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  const untilExam = daysUntilExam(today);
  const isMockDay = /mock exam/i.test(day?.focus ?? "");
  const primaryHref = tasks.length ? `/lesson/${tasks[0].id}` : isMockDay ? "/exam" : "/practice";

  const steps = [
    { n: 1, title: t("today.lesson"), href: tasks[0] ? `/lesson/${tasks[0].id}` : undefined, body: tasks.length ? null : t("today.noTask") },
    { n: 2, title: t("today.practice"), href: "/practice", value: null as number | null, hint: tasks.length ? `${tasks.length === 1 ? "today's task" : "today's tasks"} · 20 questions` : "mixed set · 20 questions" },
    { n: 3, title: t("today.cards"), href: "/flashcards", value: due, hint: "due now" },
    { n: 4, title: t("today.reviews"), href: "/errors", value: openReviews, hint: "open" },
  ];

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-5">
        <ProgressRing value={pct} size={112} label={`${dayNo}`} sublabel={`of ${PMP.plan.days}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
            {t("today.day", { day: dayNo, total: PMP.plan.days })} · {today}
          </p>
          <h1 className="mt-0.5 text-2xl leading-tight md:text-3xl">{day?.focus ?? "No plan entry"}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            {untilExam > 0 ? t("today.daysToExam", { n: untilExam }) : untilExam === 0 ? t("today.examDay") : "Exam date has passed"}
            {day ? <Badge tone="accent">{day.phase.replace("_", " ")}</Badge> : null}
            <span className="tabular">{studied.studied}/{studied.total} tasks studied</span>
          </p>
        </div>
      </header>

      <LinkButton href={primaryHref} size="lg" className="w-full text-base">
        {t("today.start")} <ArrowRight size={18} />
      </LinkButton>

      <ol className="grid gap-3 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.n}>
            <Card className="h-full p-4">
              <div className="flex items-start justify-between gap-3">
                <CardTitle>
                  {s.n} · {s.title}
                </CardTitle>
                {s.href ? (
                  <Link href={s.href} className="text-xs text-accent hover:underline">
                    open
                  </Link>
                ) : null}
              </div>
              {s.n === 1 ? (
                tasks.length === 0 ? (
                  <p className="mt-2 text-sm text-fg-muted">{s.body}</p>
                ) : (
                  <ul className="mt-2 divide-y divide-border">
                    {tasks.map((x, i) => (
                      <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <Link href={`/lesson/${x.id}`} className="font-medium hover:underline">
                            {x.title}
                          </Link>
                          <p className="text-xs text-fg-muted">
                            {DOMAIN_LABELS[x.domain]} · task {x.taskNumber} · domain is {x.weightPct}% of exam
                          </p>
                        </div>
                        {x.studied ? <Badge tone="correct">studied</Badge> : lessonsByTask[i] ? <Badge tone="accent">ready</Badge> : <Badge>no lesson yet</Badge>}
                      </li>
                    ))}
                  </ul>
                )
              ) : (
                <p className="mt-1">
                  {s.value !== null && s.value !== undefined ? <span className="font-display text-3xl tabular">{s.value}</span> : null}{" "}
                  <span className="text-sm text-fg-muted">{s.hint}</span>
                </p>
              )}
            </Card>
          </li>
        ))}
      </ol>

      {day ? (
        <Card className="flex items-center justify-between p-4">
          <div>
            <CardTitle>{t("today.markDone", { day: day.day })}</CardTitle>
            <p className="text-xs text-fg-muted">Ticks the roadmap; the ring above tracks it.</p>
          </div>
          <DayDoneToggle day={day.day} done={day.done} />
        </Card>
      ) : null}
    </div>
  );
}
