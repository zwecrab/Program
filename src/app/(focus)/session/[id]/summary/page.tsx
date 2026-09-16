import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, CardTitle, LinkButton, PageHeader, Stat } from "@/components/ui";
import { loadSession, sessionAttempts } from "@/lib/sessions";
import { PMP } from "../../../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

export default async function SummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = Number(id);
  const loaded = await loadSession(sid);
  if (!loaded) notFound();
  const rows = (await sessionAttempts(sid)).filter((r) => !r.pretest);
  const n = rows.length;
  const correct = rows.filter((r) => r.isCorrect).length;
  const pct = n ? Math.round((correct / n) * 1000) / 10 : 0;
  const byDomain = PMP.domains.map((d) => {
    const rs = rows.filter((r) => r.domain === d);
    return { d, n: rs.length, c: rs.filter((r) => r.isCorrect).length };
  });
  const fam = new Map<string, number>();
  for (const r of rows) if (!r.isCorrect && r.family) fam.set(r.family, (fam.get(r.family) ?? 0) + 1);
  const secs = rows.map((r) => r.seconds ?? 0).filter(Boolean);
  const avg = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : null;

  return (
    <div className="space-y-4">
      <PageHeader eyebrow={`Session #${sid} · ${loaded.session.kind}`} title="Session summary" description={n < 30 ? `${n} questions — small samples are noisy; treat the percentage as a hint, not a measurement.` : `${n} questions`} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Score" value={`${pct}%`} hint={`${correct}/${n}`} tone={pct >= 70 ? "correct" : n >= 30 ? "incorrect" : undefined} />
        <Stat label="Avg time" value={avg !== null ? `${avg}s` : "—"} hint={`target ${PMP.pacingSecondsPerQuestion}s`} tone={avg !== null && avg > PMP.pacingSecondsPerQuestion ? "warn" : undefined} />
        <Stat label="Misses by family" value={[...fam.values()].reduce((a, b) => a + b, 0)} hint={[...fam.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, " ") ?? "none"} />
      </div>
      <Card className="p-4">
        <CardTitle>By domain</CardTitle>
        <ul className="mt-2 divide-y divide-border text-sm">
          {byDomain.map((d) => (
            <li key={d.d} className="flex justify-between py-1.5">
              <span>{PMP.domainLabels[d.d]}</span>
              <span className="tabular text-fg-muted">
                {d.n ? `${Math.round((d.c / d.n) * 100)}% (${d.c}/${d.n})` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {fam.size ? (
        <Card className="p-4">
          <CardTitle>Distractor families that caught you</CardTitle>
          <ul className="mt-2 space-y-1 text-sm">
            {[...fam.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([f, c]) => (
                <li key={f} className="flex items-center justify-between">
                  <span>
                    <Badge tone="incorrect" className="mr-2">
                      {c}
                    </Badge>
                    {PMP.familyRules[f]?.label ?? f}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      ) : null}
      <Card className="p-4">
        <CardTitle>Questions</CardTitle>
        <ol className="mt-2 divide-y divide-border text-sm">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-start gap-2 py-1.5">
              <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${r.isCorrect ? "bg-correct" : "bg-incorrect"}`} />
              <span className="text-fg-muted tabular">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{r.stem}</span>
              {r.family ? <Badge tone="outline">{r.family}</Badge> : null}
            </li>
          ))}
        </ol>
      </Card>
      <div className="flex flex-wrap gap-2">
        <LinkButton href="/practice">Another set</LinkButton>
        <LinkButton href="/errors" variant="secondary">
          Error log
        </LinkButton>
        <Link href="/" className="inline-flex items-center px-3 text-sm text-fg-muted hover:text-fg">
          Back to Today
        </Link>
      </div>
    </div>
  );
}
