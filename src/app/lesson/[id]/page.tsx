import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Badge, Card, CardTitle } from "@/components/ui";
import { db } from "@/db/client";
import { ecoTasks } from "@/db/schema";
import { DOMAIN_LABELS } from "@/db/seed-data";
import { getLessonForTask } from "@/db/queries";
import { TaskStudiedToggle } from "@/components/task-studied-toggle";

export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) notFound();
  const [task] = await db.select().from(ecoTasks).where(eq(ecoTasks.id, taskId)).limit(1);
  if (!task) notFound();
  const lesson = await getLessonForTask(taskId);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wide text-muted">
          {DOMAIN_LABELS[task.domain]} · task {task.taskNumber} · plan day {task.planDay}
        </p>
        <h1 className="text-xl font-semibold">{task.title}</h1>
      </header>

      <Card className="flex items-center justify-between gap-3">
        <div>
          <CardTitle>I&apos;ve studied this</CardTitle>
          <p className="text-xs text-muted">Counts toward the readiness gate (all 26 tasks studied).</p>
        </div>
        <TaskStudiedToggle taskId={task.id} studied={task.studied} />
      </Card>

      {lesson ? (
        <Card>
          <div className="mb-2 flex items-center gap-2">
            <CardTitle>{lesson.titleEn}</CardTitle>
            {!lesson.reviewed ? <Badge tone="warn">unreviewed</Badge> : null}
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm">{lesson.bodyMd}</pre>
        </Card>
      ) : (
        <Card>
          <CardTitle>No lesson yet</CardTitle>
          <p className="mt-2 text-sm text-muted">
            Lessons are generated in Phase 2 (`npm run generate:lessons -- --task {task.id}`). Until then, study this task from
            the source material and tick it off above.
          </p>
        </Card>
      )}
    </div>
  );
}
