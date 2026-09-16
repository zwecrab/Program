import Link from "next/link";
import { Badge, Card, CardTitle } from "@/components/ui";
import { DayDoneToggle } from "@/components/day-done-toggle";
import { getEcoTasks, getPlanProgress, getStudyDays } from "@/db/queries";
import { planDayFor, todayIso } from "@/lib/plan";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PHASE_LABEL: Record<string, string> = {
  foundation: "Foundation",
  process: "Process (41%)",
  people: "People (33%)",
  business_environment: "Business Environment (26%)",
  consolidation: "Mocks & consolidation",
};

export default async function PlanPage() {
  const [days, tasks, progress] = await Promise.all([getStudyDays(), getEcoTasks(), getPlanProgress()]);
  const todayNo = planDayFor(todayIso());
  const tasksByDay = new Map<number, typeof tasks>();
  for (const t of tasks) tasksByDay.set(t.planDay, [...(tasksByDay.get(t.planDay) ?? []), t]);

  const groups: Array<{ phase: string; days: typeof days }> = [];
  for (const d of days) {
    const last = groups[groups.length - 1];
    if (last && last.phase === d.phase) last.days.push(d);
    else groups.push({ phase: d.phase, days: [d] });
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">47-day roadmap</h1>
        <p className="text-sm text-muted">
          15 Sep → 31 Oct 2026 · {progress.done}/{progress.total} days done · {tasks.filter((t) => t.studied).length}/26 tasks
          studied
        </p>
      </header>

      {groups.map((g, gi) => (
        <Card key={`${g.phase}-${gi}`}>
          <CardTitle>{PHASE_LABEL[g.phase] ?? g.phase}</CardTitle>
          <ol className="mt-2 divide-y divide-border">
            {g.days.map((d) => {
              const dayTasks = tasksByDay.get(d.day) ?? [];
              const isToday = d.day === todayNo;
              return (
                <li
                  key={d.day}
                  id={`day-${d.day}`}
                  className={cn("flex items-start gap-3 py-2", isToday && "-mx-2 rounded-lg bg-primary/5 px-2")}
                >
                  <DayDoneToggle day={d.day} done={d.done} compact />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-foreground">Day {d.day}</span>
                      <span>{d.date}</span>
                      {isToday ? <Badge tone="primary">today</Badge> : null}
                    </p>
                    <p className={cn("text-sm", d.done && "text-muted line-through")}>{d.focus}</p>
                    {dayTasks.length ? (
                      <ul className="mt-1 flex flex-wrap gap-1">
                        {dayTasks.map((t) => (
                          <li key={t.id}>
                            <Link href={`/lesson/${t.id}`}>
                              <Badge tone={t.studied ? "success" : "neutral"}>{t.title}</Badge>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      ))}
    </div>
  );
}
