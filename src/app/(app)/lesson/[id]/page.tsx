import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Badge, Card, CardTitle, LinkButton } from "@/components/ui";
import { DOMAIN_LABELS } from "@/db/seed-data";
import { getEcoTask, getLessonForTask } from "@/db/queries";
import { db } from "@/db/client";
import { flashcards } from "@/db/schema";
import { TaskStudiedToggle } from "@/components/task-studied-toggle";
import { CitationStrip, SupportBadge } from "@/components/citations";
import { AskBox } from "@/components/ask-box";
import { LessonSections } from "@/components/lesson-sections";
import { getT } from "@/lib/settings";
import type { Citation } from "@/lib/retrieval";
import type { SupportLevel } from "@/db/schema";

export const dynamic = "force-dynamic";

interface LessonCitations {
  overall: Citation[];
  sections: Record<string, { support: SupportLevel; citations: Citation[] }>;
  plagiarism?: Array<{ section: string; run: number }>;
}

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) notFound();
  const task = await getEcoTask(taskId);
  if (!task) notFound();
  const lesson = await getLessonForTask(taskId);
  const cards = lesson ? await db.select().from(flashcards).where(eq(flashcards.lessonId, lesson.id)) : [];
  const cit: LessonCitations | null = lesson?.citationsJson ? JSON.parse(lesson.citationsJson) : null;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
          {DOMAIN_LABELS[task.domain]} · task {task.taskNumber} · plan day {task.planDay}
        </p>
        <h1 className="mt-0.5 text-2xl leading-tight md:text-3xl">{task.title}</h1>
        {lesson?.titleMy ? <p className="mt-1 text-fg-muted">{lesson.titleMy}</p> : null}
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <CardTitle>{t("lesson.studied")}</CardTitle>
          <p className="text-xs text-fg-muted">Counts toward the readiness gate (all 26 tasks studied).</p>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href={`/practice?task=${task.id}`} variant="secondary">
            Practice this task
          </LinkButton>
          <TaskStudiedToggle taskId={task.id} studied={task.studied} labels={{ studied: t("lesson.studied"), mark: t("lesson.markStudied") }} />
        </div>
      </Card>

      {lesson ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span>Lesson v{lesson.version}</span>
            <span>· {lesson.modelUsed ?? "model"}</span>
            <SupportBadge support={lesson.support} />
            {!lesson.reviewed ? <Badge tone="warn">{t("lesson.unreviewed")}</Badge> : <Badge tone="correct">reviewed</Badge>}
            {cit?.plagiarism?.length ? <Badge tone="incorrect">25-word rule hit — regenerate</Badge> : null}
          </div>
          <LessonSections
            lessonId={lesson.id}
            reviewed={lesson.reviewed}
            sections={[
              { key: "what", title: "What this task actually is", md: lesson.bodyMd.split("\n\n## Where it sits")[0], support: cit?.sections.what },
              { key: "where", title: "Where it sits in PMBOK 8", md: extractSection(lesson.bodyMd, "Where it sits in PMBOK 8"), support: cit?.sections.where },
              { key: "predictive", title: "Predictive framing", md: lesson.predictiveMd ?? "", support: cit?.sections.predictive, pair: "adaptive" },
              { key: "adaptive", title: "Adaptive / hybrid framing", md: lesson.adaptiveMd ?? "", support: cit?.sections.adaptive, pair: "predictive" },
              { key: "artifacts", title: "Artifacts and authority", md: lesson.artifactsMd ?? "", support: cit?.sections.artifacts },
              { key: "traps", title: "Exam traps", md: lesson.trapsMd ?? "", support: cit?.sections.traps },
              { key: "example", title: "Worked example", md: lesson.exampleMd ?? "", support: cit?.sections.example },
              ...(lesson.bodyMd.includes("## အနှစ်ချုပ်") ? [{ key: "my", title: "အနှစ်ချုပ် (Burmese summary)", md: extractSection(lesson.bodyMd, "အနှစ်ချုပ် (Burmese summary)") }] : []),
            ]}
          />
          {cit?.overall?.length ? (
            <Card className="p-4">
              <CardTitle>Sources for this lesson</CardTitle>
              <CitationStrip citations={cit.overall} support={lesson.support} className="mt-2 border-t-0 pt-1" />
              {lesson.pmbokRefsJson ? <p className="mt-2 text-xs text-fg-muted">PMBOK refs: {(JSON.parse(lesson.pmbokRefsJson) as string[]).join(" · ")}</p> : null}
            </Card>
          ) : null}
          {cards.length ? (
            <Card className="p-4">
              <CardTitle>{cards.length} flashcards from this lesson</CardTitle>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {cards.slice(0, 6).map((c) => (
                  <li key={c.id} className="rounded-md border border-border bg-bg-sunken/60 p-3 text-sm">
                    <p className="font-medium">{c.front}</p>
                    <p className="mt-1 text-fg-muted">{c.back}</p>
                    <Badge className="mt-2">{c.cardType}</Badge>
                  </li>
                ))}
              </ul>
              <LinkButton href={`/flashcards?task=${task.id}`} variant="link" size="sm" className="mt-2 px-0">
                Review all {cards.length} →
              </LinkButton>
            </Card>
          ) : null}
        </>
      ) : (
        <Card className="p-5">
          <CardTitle>No lesson yet</CardTitle>
          <div className="prose-reading mt-2 text-sm text-fg-muted">
            <p>Generate it on your machine (needs the indexed sources and your OpenRouter key):</p>
            <pre className="mt-2 rounded-md bg-bg-sunken p-3 text-xs">npm run generate:lessons -- --task {task.id}</pre>
          </div>
        </Card>
      )}

      <AskBox syllabusItemId={task.id} title={t("lesson.ask")} placeholder={t("lesson.askPlaceholder")} />
    </div>
  );
}

function extractSection(md: string, heading: string): string {
  const marker = `## ${heading}`;
  const i = md.indexOf(marker);
  if (i < 0) return "";
  const rest = md.slice(i + marker.length);
  const next = rest.indexOf("\n## ");
  return (next >= 0 ? rest.slice(0, next) : rest).trim();
}

