import Link from "next/link";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { DayDoneToggle } from "@/components/day-done-toggle";
import { getEcoTasks, getPlanProgress, getStudyDays } from "@/db/queries";
import { planDayFor, todayIso } from "@/lib/plan";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/settings";

export const dynamic = "force-dynamic";

const PHASE_LABEL: Record<string, string> = {
  foundation: "Foundation",
  process: "Process (41%)",
  people: "People (33%)",
  business_environment: "Business Environment (26%)",
  consolidation: "Mocks & consolidation",
};

export default async function PlanPage() {
  const t = await getT();
  const [days, tasks, progress] = await Promise.all([getStudyDays(), getEcoTasks(), getPlanProgress()]);
  const todayNo = planDayFor(todayIso());
  const tasksByDay = new Map<number, typeof tasks>();
  for (const x of tasks) tasksByDay.set(x.planDay, [...(tasksByDay.get(x.planDay) ?? []), x]);

  const groups: Array<{ phase: string; days: typeof days }> = [];
  for (const d of days) {
    const last = groups[groups.length - 1];
    if (last && last.phase === d.phase) last.days.push(d);
    else groups.push({ phase: d.phase, days: [d] });
  }

  return (
    <div>
      <PageHeader
        eyebrow="15 Sep → 31 Oct 2026"
        title={t("plan.title")}
        description={
          <span className="tabular">
            {progress.done}/{progress.total} days done · {tasks.filter((x) => x.studied).length}/26 tasks studied
          </span>
        }
      />
      <div className="space-y-4">
        {groups.map((g, gi) => (
          <Card key={`${g.phase}-${gi}`} className="p-4">
            <CardTitle>{PHASE_LABEL[g.phase] ?? g.phase}</CardTitle>
            <ol className="mt-2 divide-y divide-border">
              {g.days.map((d) => {
                const dayTasks = tasksByDay.get(d.day) ?? [];
                const isToday = d.day === todayNo;
                return (
                  <li key={d.day} id={`day-${d.day}`} className={cn("flex items-start gap-3 py-2.5", isToday && "-mx-2 rounded-md bg-accent-soft/50 px-2")}>
                    <DayDoneToggle day={d.day} done={d.done} compact />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                        <span className="font-semibold text-fg tabular">Day {d.day}</span>
                        <span className="tabular">{d.date}</span>
                        {isToday ? <Badge tone="accent">today</Badge> : null}
                      </p>
                      <p className={cn("text-sm", d.done && "text-fg-muted line-through")}>{d.focus}</p>
                      {dayTasks.length ? (
                        <ul className="mt-1 flex flex-wrap gap-1">
                          {dayTasks.map((x) => (
                            <li key={x.id}>
                              <Link href={`/lesson/${x.id}`}>
                                <Badge tone={x.studied ? "correct" : "outline"}>{x.title}</Badge>
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
    </div>
  );
}
