import { Badge, Card, CardTitle, LinkButton } from "@/components/ui";
import { DOMAIN_LABELS } from "@/db/seed-data";
import { getBankCounts, getEcoTasks } from "@/db/queries";
import { db } from "@/db/client";
import { llmUsage, settings } from "@/db/schema";
import { sum } from "drizzle-orm";
import { LogoutButton } from "@/components/logout-button";

export const dynamic = "force-dynamic";

const BANK_TARGET_PER_TASK = 120;

export default async function AdminPage() {
  const [tasks, counts, settingRows, [spend]] = await Promise.all([
    getEcoTasks(),
    getBankCounts(),
    db.select().from(settings),
    db.select({ usd: sum(llmUsage.costUsd) }).from(llmUsage),
  ]);
  const active = new Map<number, number>();
  const other = new Map<number, number>();
  for (const c of counts) {
    if (c.status === "active") active.set(c.ecoTaskId, (active.get(c.ecoTaskId) ?? 0) + c.n);
    else other.set(c.ecoTaskId, (other.get(c.ecoTaskId) ?? 0) + c.n);
  }
  const totalActive = [...active.values()].reduce((a, b) => a + b, 0);
  const cap = Number(settingRows.find((s) => s.key === "monthly_llm_cap_usd")?.value ?? 5);
  const spent = Number(spend?.usd ?? 0);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Admin</h1>
        <LogoutButton />
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardTitle>Bank</CardTitle>
          <p className="text-2xl font-semibold">{totalActive}</p>
          <p className="text-xs text-muted">active questions · target {BANK_TARGET_PER_TASK * 26}</p>
        </Card>
        <Card>
          <CardTitle>LLM spend (all time)</CardTitle>
          <p className="text-2xl font-semibold">${spent.toFixed(2)}</p>
          <p className="text-xs text-muted">monthly cap ${cap.toFixed(2)}</p>
        </Card>
        <Card className="flex flex-col justify-between">
          <CardTitle>Manual entry</CardTitle>
          <LinkButton href="/admin/questions/new" variant="secondary" className="mt-2">
            Add a question
          </LinkButton>
        </Card>
      </div>

      <Card>
        <CardTitle>Bank composition by ECO task</CardTitle>
        <ul className="mt-2 divide-y divide-border">
          {tasks.map((t) => {
            const n = active.get(t.id) ?? 0;
            const pending = other.get(t.id) ?? 0;
            const pct = Math.min(100, (n / BANK_TARGET_PER_TASK) * 100);
            return (
              <li key={t.id} className="py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-muted">{DOMAIN_LABELS[t.domain].slice(0, 3)} {t.taskNumber} · </span>
                    {t.title}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {n}/{BANK_TARGET_PER_TASK}
                    {pending ? <Badge tone="warn" className="ml-1">{pending} pending</Badge> : null}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded bg-border">
                  <div className="h-1.5 rounded bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardTitle>Coming in later phases</CardTitle>
        <p className="mt-2 text-sm text-muted">Generation jobs, QA review queue, LLM usage log, DB export (Phase 2–4).</p>
      </Card>
    </div>
  );
}
