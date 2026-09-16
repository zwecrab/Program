import { desc, sql } from "drizzle-orm";
import { Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { db } from "@/db/client";
import { llmUsage } from "@/db/schema";
import { monthlySpend } from "@/lib/llm";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const [spend, byPurpose, recent, total] = await Promise.all([
    monthlySpend(),
    db
      .select({ purpose: llmUsage.purpose, n: sql<number>`count(*)`, usd: sql<number>`sum(${llmUsage.costUsd})`, pt: sql<number>`sum(${llmUsage.promptTokens})`, ct: sql<number>`sum(${llmUsage.completionTokens})` })
      .from(llmUsage)
      .groupBy(llmUsage.purpose),
    db.select().from(llmUsage).orderBy(desc(llmUsage.calledAt)).limit(60),
    db.select({ usd: sql<number>`coalesce(sum(${llmUsage.costUsd}),0)`, n: sql<number>`count(*)` }).from(llmUsage),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Admin" title="LLM usage" description="Every call, with token counts and computed cost. Compare the total with OpenRouter's dashboard; they should match within rounding." />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="This month" value={`$${spend.spent.toFixed(3)}`} hint={`cap $${spend.cap.toFixed(2)}`} tone={spend.spent >= spend.cap ? "incorrect" : spend.spent >= spend.cap * 0.8 ? "warn" : undefined} />
        <Stat label="All time" value={`$${Number(total[0]?.usd ?? 0).toFixed(3)}`} hint={`${total[0]?.n ?? 0} calls`} />
        <Stat label="Avg per call" value={`$${total[0]?.n ? (Number(total[0].usd) / Number(total[0].n)).toFixed(4) : "0"}`} />
      </div>
      <Card className="p-4">
        <CardTitle>By purpose</CardTitle>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-fg-muted">
            <tr>
              <th className="py-1">purpose</th>
              <th>calls</th>
              <th>prompt tok</th>
              <th>completion tok</th>
              <th className="text-right">USD</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {byPurpose.map((r) => (
              <tr key={r.purpose} className="border-t border-border">
                <td className="py-1">{r.purpose}</td>
                <td>{r.n}</td>
                <td>{Number(r.pt).toLocaleString()}</td>
                <td>{Number(r.ct).toLocaleString()}</td>
                <td className="text-right">${Number(r.usd).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="divide-y divide-border text-xs">
        {recent.map((r) => (
          <div key={r.id} className="grid grid-cols-[10rem_7rem_1fr_6rem_5rem] gap-2 px-3 py-1.5 tabular">
            <span className="text-fg-muted">{r.calledAt.slice(0, 19).replace("T", " ")}</span>
            <span>{r.purpose}</span>
            <span className="truncate text-fg-muted">{r.model}</span>
            <span className="text-fg-muted">
              {r.promptTokens}+{r.completionTokens}
            </span>
            <span className="text-right">${r.costUsd.toFixed(4)}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}
