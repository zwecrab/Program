import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardTitle, LinkButton, PageHeader, Stat } from "@/components/ui";
import { PaceHistogram } from "@/components/charts";
import { mockResults, loadExam } from "@/lib/exam";
import { PMP } from "../../../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

export default async function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = Number(id);
  const [ex, r] = await Promise.all([loadExam(sid), mockResults(sid)]);
  if (!ex || !r) notFound();
  const heat = (pct: number | null) => (pct === null ? "var(--bg-sunken)" : pct < 50 ? "var(--heat-0)" : pct < 60 ? "var(--heat-1)" : pct < 70 ? "var(--heat-2)" : pct < 80 ? "var(--heat-3)" : "var(--heat-4)");

  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`Mock · ${ex.session.startedAt.slice(0, 10)} · ${r.minutesUsed} min`} title={r.verdict.go ? "Go" : "No-go — not yet"} description={r.verdict.go ? "Every gate passes on this mock." : r.verdict.reasons.join(" · ")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Scored" value={`${r.overall.pct}%`} hint={`${r.overall.correct}/${r.overall.n} · gate ${PMP.readinessGates.overallPct}%`} tone={r.overall.pct >= PMP.readinessGates.overallPct ? "correct" : "incorrect"} />
        <Stat label="Pretest (unscored)" value={`${r.pretest.correct}/${r.pretest.n}`} hint="never counted, mirrors PMI" />
        <Stat label="Pace" value={r.pace.median !== null ? `${r.pace.median}s` : "—"} hint={`${r.pace.over}/${r.pace.total} over ${PMP.pacingSecondsPerQuestion}s`} tone={r.pace.median !== null && r.pace.median > PMP.pacingSecondsPerQuestion ? "warn" : undefined} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <CardTitle>Per domain</CardTitle>
          <ul className="mt-2 divide-y divide-border text-sm">
            {r.byDomain.map((d) => (
              <li key={d.domain} className="flex items-center justify-between py-2">
                <span>{d.label}</span>
                <span className="flex items-center gap-2 tabular">
                  {d.pct === null ? "—" : `${d.pct}%`} <span className="text-fg-muted">({d.correct}/{d.n})</span>
                  <Badge tone={d.pct !== null && d.pct >= PMP.readinessGates.domainPct ? "correct" : "incorrect"}>{d.pct !== null && d.pct >= PMP.readinessGates.domainPct ? "OK" : "below"}</Badge>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-4">
          <CardTitle>Distractor-family tally</CardTitle>
          {r.families.length === 0 ? (
            <p className="mt-1 text-sm text-fg-muted">No wrong answers with a family.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {r.families.map((f) => (
                <li key={f.family} className="flex items-center gap-2">
                  <span className="w-8 text-right font-display text-lg tabular">{f.count}</span>
                  <div className="h-2 flex-1 rounded-full bg-bg-sunken">
                    <div className="h-2 rounded-full bg-incorrect" style={{ width: `${(f.count / r.families[0].count) * 100}%` }} />
                  </div>
                  <span className="w-44 truncate text-fg-muted">{f.label}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card className="p-4">
        <CardTitle>Per ECO task</CardTitle>
        <div className="mt-2 grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-9">
          {r.byTask.map((x) => (
            <div key={x.id} className="rounded-md border border-border p-1.5 text-[10px] leading-tight" style={{ background: heat(x.pct) }} title={x.title}>
              <div className="flex justify-between font-medium">
                <span>{x.code}</span>
                <span className="text-fg-muted">{x.n}q</span>
              </div>
              <div className="font-display text-base tabular">{x.pct === null ? "—" : `${x.pct}%`}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <CardTitle>Time per question</CardTitle>
        {r.pace.total ? <PaceHistogram buckets={r.pace.buckets} targetLabel="60–80s" /> : <p className="text-sm text-fg-muted">No timing data.</p>}
      </Card>
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/analytics">Analytics</LinkButton>
        <LinkButton href="/errors" variant="secondary">
          Error log
        </LinkButton>
        <Link href="/exam" className="inline-flex items-center px-3 text-sm text-fg-muted hover:text-fg">
          Back to exam page
        </Link>
      </div>
    </div>
  );
}
