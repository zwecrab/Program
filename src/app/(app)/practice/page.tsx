import Link from "next/link";
import { Badge, Button, Card, CardTitle, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { getActiveQuestionCount, getEcoTasks } from "@/db/queries";
import { recentSessions } from "@/lib/sessions";
import { startPractice } from "@/app/session-actions";
import { getT } from "@/lib/settings";
import { PMP } from "../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ task?: string }> }) {
  const t = await getT();
  const sp = await searchParams;
  const [tasks, bank, recent] = await Promise.all([getEcoTasks(), getActiveQuestionCount(), recentSessions("practice", 8)]);
  const preTask = Number(sp.task) || null;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${bank} active questions in the bank`} title={t("practice.title")} description="One question per screen. Review every option after each answer." />
      {bank === 0 ? (
        <EmptyState title="The bank is empty">
          Generate questions on your machine first: <code>npm run generate:questions -- --task 23 --count 20</code>, or queue a run from Admin.
        </EmptyState>
      ) : null}
      <form action={startPractice}>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Set">
            <Select name="mode" defaultValue={preTask ? "task" : "mixed"}>
              <option value="mixed">Mixed — all domains</option>
              <option value="task">One ECO task</option>
              <option value="domain">One domain</option>
              <option value="weak">Weak areas only</option>
              <option value="unseen">Unseen only</option>
            </Select>
          </Field>
          <Field label="ECO task (for 'one task')">
            <Select name="taskId" defaultValue={preTask ?? tasks[0]?.id}>
              {tasks.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Domain (for 'one domain')">
            <Select name="domain" defaultValue="process">
              {PMP.domains.map((d) => (
                <option key={d} value={d}>
                  {PMP.domainLabels[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Questions">
            <Input name="count" type="number" min={5} max={60} defaultValue={20} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="timed" className="h-4 w-4" /> Timed — {PMP.pacingSecondsPerQuestion}s per question, like the real exam
          </label>
          <Button type="submit" size="lg" className="sm:col-span-2" disabled={bank === 0}>
            {t("practice.start")}
          </Button>
        </Card>
      </form>

      {recent.length ? (
        <Card className="p-4">
          <CardTitle>Recent practice</CardTitle>
          <ul className="mt-2 divide-y divide-border text-sm">
            {recent.map((s) => {
              const cfg = JSON.parse(s.configJson ?? "{}") as { mode?: string; count?: number };
              return (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={s.endedAt ? `/session/${s.id}/summary` : `/session/${s.id}`} className="hover:underline">
                    #{s.id} · {cfg.mode ?? "practice"} · {cfg.count ?? "?"} q · {s.startedAt.slice(0, 16).replace("T", " ")}
                  </Link>
                  {s.endedAt ? <Badge tone={s.scorePct !== null && s.scorePct >= 70 ? "correct" : "neutral"}>{s.scorePct ?? "—"}%</Badge> : <Badge tone="accent">in progress</Badge>}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
