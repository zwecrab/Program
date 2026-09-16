import Link from "next/link";
import { Badge, Button, Card, CardTitle, PageHeader } from "@/components/ui";
import { activeQuestionCount } from "@/lib/exam";
import { recentSessions } from "@/lib/sessions";
import { startMock } from "@/app/exam-actions";
import { getT } from "@/lib/settings";
import { PMP } from "../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

export default async function ExamPage() {
  const t = await getT();
  const [bank, mocks] = await Promise.all([activeQuestionCount(), recentSessions("mock", 10)]);
  const enough = bank >= PMP.questionCount;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Matches the 2026 format" title={t("exam.title")} description={`${PMP.questionCount} questions · ${PMP.minutes} minutes · ${PMP.breaks.count} optional ${PMP.breaks.minutes}-minute breaks · ${PMP.scoredCount} scored + ${PMP.questionCount - PMP.scoredCount} unscored pretest items`} />
      <Card className="p-5">
        <CardTitle>Before you start</CardTitle>
        <ul className="prose-reading mt-2 list-disc pl-5 text-sm text-fg-muted">
          <li>The paper opens with the case-study block. When you leave it — to take the first break or just to continue — it locks and cannot be revisited. That is a genuine one-way gate; it is the constraint you need to rehearse.</li>
          <li>There is no pause. Closing the tab and coming back resumes with the clock still running. The clock stops only during the two breaks (max {PMP.breaks.minutes} min each).</li>
          <li>You can move back and forth and flag questions within the current section. Answers are scored when a section locks or you submit.</li>
          <li>{PMP.questionCount - PMP.scoredCount} items are unscored pretest questions, marked internally, so your reported score mirrors how PMI computes it.</li>
        </ul>
        <form action={startMock} className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" disabled={bank < 20}>
            Start a full mock
          </Button>
          <span className="text-sm text-fg-muted">
            {enough ? `${bank} active questions in the bank.` : `Only ${bank} active questions — the mock will be shorter than ${PMP.questionCount} until the bank fills. Score still reports as a percentage.`}
          </span>
        </form>
      </Card>
      {mocks.length ? (
        <Card className="p-4">
          <CardTitle>Mocks</CardTitle>
          <ul className="mt-2 divide-y divide-border text-sm">
            {mocks.map((m, i) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={m.endedAt ? `/exam/${m.id}/results` : `/exam/${m.id}`} className="hover:underline">
                  Mock {mocks.length - i} · {m.startedAt.slice(0, 16).replace("T", " ")}
                </Link>
                {m.endedAt ? <Badge tone={m.scorePct !== null && m.scorePct >= PMP.readinessGates.overallPct ? "correct" : "incorrect"}>{m.scorePct ?? "—"}%</Badge> : <Badge tone="accent">in progress — clock running</Badge>}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
