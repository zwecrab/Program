import { Card, CardTitle } from "@/components/ui";
import { getActiveQuestionCount, getSessions } from "@/db/queries";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [bank, sessions] = await Promise.all([getActiveQuestionCount(), getSessions()]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Practice</h1>
      <Card>
        <CardTitle>Not built yet</CardTitle>
        <p className="mt-2 text-sm text-muted">Configurable practice sets — by task, domain, mixed, weak-areas or unseen — arrive in Phase 3.</p>
        <p className="mt-2 text-xs text-muted">
          Bank: {bank} active questions · {sessions.length} session(s) recorded (first: {sessions[0]?.startedAt.slice(0, 10) ?? "—"},{" "}
          {sessions[0]?.scorePct ?? "—"}%).
        </p>
      </Card>
    </div>
  );
}
