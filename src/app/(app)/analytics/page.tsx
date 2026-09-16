import Link from "next/link";
import { Badge, Card, CardTitle, LinkButton, PageHeader } from "@/components/ui";
import { AccuracyOverTime, FamilyTrend, PaceHistogram } from "@/components/charts";
import { domainAccuracy, familyTallyByMock, paceStats, perTaskAccuracy, readinessGates, sessionScores, SMALL_SAMPLE } from "@/lib/analytics";
import { getT } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { PMP } from "../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

function heat(pct: number | null, n: number): string {
  if (pct === null || n === 0) return "var(--bg-sunken)";
  if (pct < 50) return "var(--heat-0)";
  if (pct < 60) return "var(--heat-1)";
  if (pct < 70) return "var(--heat-2)";
  if (pct < 80) return "var(--heat-3)";
  return "var(--heat-4)";
}

export default async function AnalyticsPage() {
  const t = await getT();
  const [gates, points, domains, tasks, tally, pace] = await Promise.all([readinessGates(), sessionScores(), domainAccuracy(), perTaskAccuracy(), familyTallyByMock(), paceStats()]);
  const allOk = gates.every((g) => g.ok);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("stats.title")}
        title={allOk ? "Ready — all gates pass" : "Not yet — gates below"}
        description="Percentages from fewer than 30 questions are shown but never treated as reliable."
        actions={
          <LinkButton href="/api/export?format=csv" variant="secondary" size="sm" prefetch={false}>
            Export CSV
          </LinkButton>
        }
      />

      <Card className="p-4">
        <CardTitle>{t("stats.gates")}</CardTitle>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {gates.map((g) => (
            <li key={g.key} className={cn("flex items-start justify-between gap-3 rounded-md border p-3", g.ok ? "border-correct/50 bg-correct-soft/40" : "border-border")}>
              <div className="min-w-0">
                <p className="text-sm font-medium">{g.label}</p>
                <p className="text-xs text-fg-muted">
                  target {g.target}
                  {g.detail ? ` · ${g.detail}` : ""}
                </p>
                <p className="mt-1 text-sm tabular">{g.value}</p>
              </div>
              <Badge tone={g.ok ? "correct" : "neutral"}>{g.ok ? "OK" : "not yet"}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <CardTitle>Accuracy over time</CardTitle>
          <p className="mb-1 text-xs text-fg-muted">First point is the 16 Sep cold baseline (15 questions, 4 correct). Hollow dots = fewer than {SMALL_SAMPLE} questions, treat as noise.</p>
          {points.length ? <AccuracyOverTime points={points} target={PMP.readinessGates.overallPct} /> : <p className="text-sm text-fg-muted">No sessions yet.</p>}
        </Card>
        <Card className="p-4">
          <CardTitle>By domain</CardTitle>
          <ul className="mt-2 space-y-2 text-sm">
            {domains.map((d) => (
              <li key={d.domain}>
                <div className="flex justify-between">
                  <span>{d.label}</span>
                  <span className="tabular text-fg-muted">
                    {d.pct === null ? "—" : `${d.pct}%`} <span className="text-fg-faint">· {d.n} q{d.n && d.n < SMALL_SAMPLE ? " (small)" : ""}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full rounded-full bg-bg-sunken">
                  <div className="h-2 rounded-full" style={{ width: `${d.pct ?? 0}%`, background: heat(d.pct, d.n) }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-muted">Gate: every domain ≥ {PMP.readinessGates.domainPct}% on ≥ {SMALL_SAMPLE} questions.</p>
        </Card>
      </div>

      <Card className="p-4">
        <CardTitle>Per-task heatmap</CardTitle>
        <p className="mb-2 text-xs text-fg-muted">26 ECO tasks coloured by accuracy; the small number is the plan day.</p>
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-9">
          {tasks.map((x) => (
            <Link
              key={x.id}
              href={`/lesson/${x.id}`}
              title={`${x.title}\n${x.pct === null ? "no attempts" : `${x.pct}% (${x.correct}/${x.n})`}`}
              className="flex aspect-square flex-col justify-between rounded-md border border-border p-1.5 text-[10px] leading-tight hover:border-accent"
              style={{ background: heat(x.pct, x.n) }}
            >
              <span className="flex justify-between font-medium">
                <span>{x.code}</span>
                <span className="text-fg-muted">d{x.planDay}</span>
              </span>
              <span className="line-clamp-2 text-fg-muted">{x.title}</span>
              <span className="font-display text-base tabular">{x.pct === null ? "—" : `${Math.round(x.pct)}%`}</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <CardTitle>Distractor families across mocks</CardTitle>
          {tally.mocks.length === 0 ? (
            <p className="mt-1 text-sm text-fg-muted">No completed mocks yet. The tally starts with Mock 1.</p>
          ) : (
            <>
              <FamilyTrend mocks={tally.mocks} families={tally.families} />
              {tally.verdict ? <p className={cn("mt-2 rounded-md p-2 text-sm", tally.verdict.startsWith("Flat") ? "bg-incorrect-soft" : "bg-correct-soft")}>{tally.verdict}</p> : null}
            </>
          )}
          <ul className="mt-2 grid grid-cols-2 gap-x-4 text-xs text-fg-muted">
            {tally.families
              .filter((f) => f.total > 0)
              .sort((a, b) => b.total - a.total)
              .map((f) => (
                <li key={f.family} className="flex justify-between">
                  <span>{f.family.replace(/_/g, " ")}</span>
                  <span className="tabular">{f.perMock.map((m) => m.count).join(" → ")}</span>
                </li>
              ))}
          </ul>
        </Card>
        <Card className="p-4">
          <CardTitle>Time per question</CardTitle>
          <p className="mb-1 text-xs text-fg-muted">
            The real exam allows {PMP.pacingSecondsPerQuestion}s per question. {pace.total ? `Median ${pace.median}s · ${pace.over} of ${pace.total} over pace.` : "No timed data yet."}
          </p>
          {pace.total ? <PaceHistogram buckets={pace.buckets} targetLabel="60–80s" /> : null}
        </Card>
      </div>
    </div>
  );
}
