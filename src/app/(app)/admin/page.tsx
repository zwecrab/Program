import Link from "next/link";
import { count, desc, eq, sql } from "drizzle-orm";
import { Badge, Card, CardTitle, LinkButton, PageHeader, Progress, Stat } from "@/components/ui";
import { DOMAIN_LABELS } from "@/db/seed-data";
import { getBankCounts, getEcoTasks } from "@/db/queries";
import { db } from "@/db/client";
import { generationRuns, questions, sourceChunks } from "@/db/schema";
import { monthlySpend } from "@/lib/llm";
import { LogoutButton } from "@/components/logout-button";
import { AdminGenerateForm, AdminSettingsForm } from "./forms";
import { getLocale } from "@/lib/settings";
import { PMP } from "../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [tasks, counts, spend, chunkCount, runs, byType, byDelivery, byDifficulty, locale] = await Promise.all([
    getEcoTasks(),
    getBankCounts(),
    monthlySpend(),
    db.select({ n: count() }).from(sourceChunks),
    db.select().from(generationRuns).orderBy(desc(generationRuns.createdAt)).limit(5),
    db.select({ k: questions.itemType, n: count() }).from(questions).where(eq(questions.status, "active")).groupBy(questions.itemType),
    db.select({ k: questions.deliveryApproach, n: count() }).from(questions).where(eq(questions.status, "active")).groupBy(questions.deliveryApproach),
    db.select({ k: sql<string>`cast(${questions.difficulty} as text)`, n: count() }).from(questions).where(eq(questions.status, "active")).groupBy(questions.difficulty),
    getLocale(),
  ]);
  const active = new Map<number, number>();
  const pending = new Map<number, number>();
  const quarantined = new Map<number, number>();
  for (const c of counts) {
    const m = c.status === "active" ? active : c.status === "qa_pending" ? pending : c.status === "quarantined" || c.status === "failed" ? quarantined : null;
    m?.set(c.syllabusItemId, (m.get(c.syllabusItemId) ?? 0) + c.n);
  }
  const totalActive = [...active.values()].reduce((a, b) => a + b, 0);
  const totalQueue = [...quarantined.values()].reduce((a, b) => a + b, 0) + [...pending.values()].reduce((a, b) => a + b, 0);
  const target = PMP.bank.minPerItem * PMP.syllabus.length;
  const ratio = spend.cap ? spend.spent / spend.cap : 0;

  const domainTotals = PMP.domains.map((d) => ({
    d,
    n: tasks.filter((x) => x.domain === d).reduce((a, x) => a + (active.get(x.id) ?? 0), 0),
  }));

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Admin" title="Bank, generation and spend" actions={<LogoutButton />} />

      {ratio >= 0.8 ? (
        <Card className={`p-3 text-sm ${ratio >= 1 ? "border-incorrect bg-incorrect-soft" : "border-warn bg-warn-soft"}`}>
          {ratio >= 1
            ? `Monthly LLM cap reached ($${spend.spent.toFixed(2)} of $${spend.cap.toFixed(2)}). Runtime generation is paused; the app serves the existing bank.`
            : `LLM spend is at ${(ratio * 100).toFixed(0)}% of the monthly cap ($${spend.spent.toFixed(2)} of $${spend.cap.toFixed(2)}).`}
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active questions" value={totalActive} hint={`target ${target.toLocaleString()}`} />
        <Stat label="QA queue" value={totalQueue} hint={<Link href="/admin/queue" className="text-accent hover:underline">review →</Link>} tone={totalQueue ? "warn" : undefined} />
        <Stat label="Source chunks" value={chunkCount[0]?.n ?? 0} hint={chunkCount[0]?.n ? "indexed" : "run npm run index:sources"} tone={chunkCount[0]?.n ? undefined : "incorrect"} />
        <Stat label="LLM spend this month" value={`$${spend.spent.toFixed(2)}`} hint={<Link href="/admin/usage" className="text-accent hover:underline">cap ${spend.cap.toFixed(2)} · log →</Link>} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="p-4">
          <CardTitle>Domain mix</CardTitle>
          <ul className="mt-2 space-y-2 text-sm">
            {domainTotals.map(({ d, n }) => (
              <li key={d}>
                <div className="flex justify-between">
                  <span>{DOMAIN_LABELS[d]}</span>
                  <span className="tabular text-fg-muted">
                    {totalActive ? Math.round((n / totalActive) * 100) : 0}% <span className="text-fg-faint">/ {PMP.domainWeights[d]}%</span>
                  </span>
                </div>
                <Progress value={totalActive ? (n / totalActive) * 100 : 0} />
              </li>
            ))}
          </ul>
        </Card>
        <MixCard title="Delivery approach" rows={byDelivery} total={totalActive} targets={PMP.bank.deliveryMix} />
        <MixCard title="Difficulty" rows={byDifficulty} total={totalActive} targets={{ "1": 0.25, "2": 0.5, "3": 0.25 }} />
      </div>

      <MixCard title="Item types" rows={byType} total={totalActive} targets={PMP.bank.itemTypeMix} wide />

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <CardTitle>Bank by ECO task</CardTitle>
          <span className="text-xs text-fg-muted">active / {PMP.bank.minPerItem} · pending · quarantined</span>
        </div>
        <ul className="mt-2 divide-y divide-border">
          {tasks.map((x) => {
            const n = active.get(x.id) ?? 0;
            return (
              <li key={x.id} className="py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-fg-muted">{x.code} · </span>
                    <Link href={`/admin/queue?task=${x.id}`} className="hover:underline">
                      {x.title}
                    </Link>
                  </span>
                  <span className="flex shrink-0 items-center gap-1 tabular">
                    {n}/{PMP.bank.minPerItem}
                    {pending.get(x.id) ? <Badge tone="warn">{pending.get(x.id)} pending</Badge> : null}
                    {quarantined.get(x.id) ? <Badge tone="incorrect">{quarantined.get(x.id)} quarantined</Badge> : null}
                  </span>
                </div>
                <Progress value={(n / PMP.bank.minPerItem) * 100} className="mt-1" tone={n >= PMP.bank.minPerItem ? "correct" : "accent"} />
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="p-4">
          <CardTitle>Generation jobs</CardTitle>
          <p className="mb-2 mt-1 text-xs text-fg-muted">Queued runs are performed on your machine by <code>npm run jobs</code> (LLM calls never run in the browser).</p>
          <AdminGenerateForm tasks={tasks.map((x) => ({ id: x.id, title: `${x.code} · ${x.title}` }))} />
          <ul className="mt-3 divide-y divide-border text-sm">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  #{r.id} {r.kind} {r.syllabusItemId ? `· task ${r.syllabusItemId}` : ""}
                </span>
                <span className="flex items-center gap-2 text-xs text-fg-muted tabular">
                  {r.passed}/{r.requested} · ${r.costUsd.toFixed(3)}
                  <Badge tone={r.status === "done" ? "correct" : r.status === "failed" ? "incorrect" : r.status === "running" ? "accent" : "neutral"}>{r.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
          <LinkButton href="/admin/runs" variant="link" size="sm" className="mt-1 px-0">
            All runs →
          </LinkButton>
        </Card>
        <Card className="p-4">
          <CardTitle>Settings & export</CardTitle>
          <AdminSettingsForm cap={spend.cap} locale={locale} />
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkButton href="/api/export" variant="secondary" size="sm" prefetch={false}>
              Download DB export (JSON)
            </LinkButton>
            <LinkButton href="/api/export?format=csv" variant="secondary" size="sm" prefetch={false}>
              Attempts CSV (tracker columns)
            </LinkButton>
            <LinkButton href="/admin/questions/new" variant="secondary" size="sm">
              Add a question by hand
            </LinkButton>
            <LinkButton href="/design" variant="secondary" size="sm">
              Design system
            </LinkButton>
          </div>
        </Card>
      </div>
    </div>
  );
}

function MixCard({ title, rows, total, targets, wide }: { title: string; rows: Array<{ k: string; n: number }>; total: number; targets: Record<string, number>; wide?: boolean }) {
  const keys = Object.keys(targets);
  return (
    <Card className="p-4">
      <CardTitle>{title}</CardTitle>
      <ul className={`mt-2 grid gap-x-6 gap-y-2 text-sm ${wide ? "sm:grid-cols-2 lg:grid-cols-4" : ""}`}>
        {keys.map((k) => {
          const n = rows.find((r) => String(r.k) === k)?.n ?? 0;
          const pct = total ? (n / total) * 100 : 0;
          return (
            <li key={k}>
              <div className="flex justify-between">
                <span>{k.replace(/_/g, " ")}</span>
                <span className="tabular text-fg-muted">
                  {Math.round(pct)}% <span className="text-fg-faint">/ {Math.round(targets[k] * 100)}%</span>
                </span>
              </div>
              <Progress value={pct} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
