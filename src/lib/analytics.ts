/**
 * Analytics (build prompt §10). Pure SQL + small pure functions so the
 * dashboard, the CSV export and the exam verdict share one definition.
 */
import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, questions, sessions, syllabusItems } from "@/db/schema";
import { getExamId } from "@/db/queries";
import { PMP } from "../../config/exams/pmp";

export const SMALL_SAMPLE = 30;

export interface GateResult {
  key: "overall" | "domains" | "studied" | "mocks";
  label: string;
  ok: boolean;
  value: string;
  target: string;
  detail?: string;
}

export interface SessionPoint {
  sessionId: number;
  kind: string;
  date: string;
  questions: number;
  correct: number;
  pct: number;
  smallSample: boolean;
  label?: string;
}

/** Score per session, with the 16 Sep baseline (no attempt rows) read from config_json. */
export async function sessionScores(): Promise<SessionPoint[]> {
  const examId = await getExamId();
  const rows = await db
    .select({
      id: sessions.id,
      kind: sessions.kind,
      startedAt: sessions.startedAt,
      endedAt: sessions.endedAt,
      configJson: sessions.configJson,
      scorePct: sessions.scorePct,
      n: sql<number>`(select count(*) from attempts a where a.session_id = ${sessions.id} and a.pretest = 0)`,
      correct: sql<number>`(select count(*) from attempts a where a.session_id = ${sessions.id} and a.pretest = 0 and a.is_correct = 1)`,
    })
    .from(sessions)
    .where(and(eq(sessions.examId, examId), isNotNull(sessions.endedAt)))
    .orderBy(asc(sessions.startedAt));
  return rows
    .map((r) => {
      const cfg = (r.configJson ? JSON.parse(r.configJson) : {}) as { questions?: number; correct?: number; label?: string };
      const n = Number(r.n) || cfg.questions || 0;
      const correct = Number(r.correct) || cfg.correct || 0;
      const pct = n ? (correct / n) * 100 : (r.scorePct ?? 0);
      return { sessionId: r.id, kind: r.kind, date: r.startedAt.slice(0, 10), questions: n, correct, pct: Math.round(pct * 10) / 10, smallSample: n < SMALL_SAMPLE, label: cfg.label };
    })
    .filter((p) => p.questions > 0);
}

export interface DomainAccuracy {
  domain: string;
  label: string;
  n: number;
  correct: number;
  pct: number | null;
}

export async function domainAccuracy(sinceIso?: string): Promise<DomainAccuracy[]> {
  const rows = await db
    .select({ domain: questions.domain, n: sql<number>`count(*)`, correct: sql<number>`sum(case when ${attempts.isCorrect} then 1 else 0 end)` })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(and(eq(attempts.pretest, false), sinceIso ? sql`${attempts.answeredAt} >= ${sinceIso}` : undefined))
    .groupBy(questions.domain);
  return PMP.domains.map((d) => {
    const r = rows.find((x) => x.domain === d);
    const n = Number(r?.n ?? 0);
    const c = Number(r?.correct ?? 0);
    return { domain: d, label: PMP.domainLabels[d], n, correct: c, pct: n ? Math.round((c / n) * 1000) / 10 : null };
  });
}

export interface TaskAccuracy {
  id: number;
  code: string;
  title: string;
  domain: string;
  planDay: number;
  studied: boolean;
  n: number;
  correct: number;
  pct: number | null;
}

export async function perTaskAccuracy(): Promise<TaskAccuracy[]> {
  const examId = await getExamId();
  const items = await db.select().from(syllabusItems).where(eq(syllabusItems.examId, examId)).orderBy(asc(syllabusItems.id));
  const rows = await db
    .select({ id: questions.syllabusItemId, n: sql<number>`count(*)`, correct: sql<number>`sum(case when ${attempts.isCorrect} then 1 else 0 end)` })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(eq(attempts.pretest, false))
    .groupBy(questions.syllabusItemId);
  return items.map((it) => {
    const r = rows.find((x) => x.id === it.id);
    const n = Number(r?.n ?? 0);
    const c = Number(r?.correct ?? 0);
    return { id: it.id, code: it.code, title: it.title, domain: it.domain, planDay: it.planDay, studied: it.studied, n, correct: c, pct: n ? Math.round((c / n) * 1000) / 10 : null };
  });
}

export interface FamilyTally {
  family: string;
  perMock: Array<{ sessionId: number; date: string; count: number }>;
  total: number;
}

/** Distractor-family counts per completed mock, in mock order (1 → 2 → 3 …). */
export async function familyTallyByMock(): Promise<{ mocks: Array<{ sessionId: number; date: string }>; families: FamilyTally[]; verdict: string | null }> {
  const examId = await getExamId();
  const mocks = await db
    .select({ id: sessions.id, date: sessions.startedAt })
    .from(sessions)
    .where(and(eq(sessions.examId, examId), eq(sessions.kind, "mock"), isNotNull(sessions.endedAt)))
    .orderBy(asc(sessions.startedAt));
  const rows = mocks.length
    ? await db
        .select({ sessionId: attempts.sessionId, family: attempts.distractorFamily, n: sql<number>`count(*)` })
        .from(attempts)
        .where(and(eq(attempts.isCorrect, false), isNotNull(attempts.distractorFamily), sql`${attempts.sessionId} in (${sql.join(mocks.map((m) => sql`${m.id}`), sql`, `)})`))
        .groupBy(attempts.sessionId, attempts.distractorFamily)
    : [];
  const families: FamilyTally[] = PMP.distractorFamilies.map((f) => {
    const perMock = mocks.map((m) => ({ sessionId: m.id, date: m.date.slice(0, 10), count: Number(rows.find((r) => r.sessionId === m.id && r.family === f)?.n ?? 0) }));
    return { family: f, perMock, total: perMock.reduce((a, b) => a + b.count, 0) };
  });
  let verdict: string | null = null;
  if (mocks.length >= 2) {
    const first = families.reduce((a, f) => a + f.perMock[0].count, 0);
    const last = families.reduce((a, f) => a + f.perMock[mocks.length - 1].count, 0);
    const flat = families.filter((f) => f.perMock[0].count >= 3 && f.perMock[mocks.length - 1].count >= f.perMock[0].count).map((f) => f.family);
    if (flat.length) verdict = `Flat or rising across mocks: ${flat.join(", ")}. A family that does not fall means you are memorising questions, not learning the rule behind them — re-read those rules before the next mock.`;
    else if (last < first) verdict = `Total misses by family fell from ${first} to ${last} across mocks. The rules are landing.`;
  }
  return { mocks: mocks.map((m) => ({ sessionId: m.id, date: m.date.slice(0, 10) })), families, verdict };
}

export async function paceStats(): Promise<{ buckets: Array<{ label: string; count: number }>; median: number | null; over: number; total: number }> {
  const rows = await db.select({ s: attempts.secondsSpent }).from(attempts).where(and(isNotNull(attempts.secondsSpent), eq(attempts.pretest, false)));
  const secs = rows.map((r) => Number(r.s)).filter((s) => s > 0).sort((a, b) => a - b);
  const edges = [30, 60, 80, 120, 180];
  const buckets = [...edges, Infinity].map((e, i) => ({
    label: i === 0 ? `<${e}s` : e === Infinity ? `>${edges[i - 1]}s` : `${edges[i - 1]}–${e}s`,
    count: secs.filter((s) => s >= (i === 0 ? 0 : edges[i - 1]) && s < e).length,
  }));
  return { buckets, median: secs.length ? secs[Math.floor(secs.length / 2)] : null, over: secs.filter((s) => s > PMP.pacingSecondsPerQuestion).length, total: secs.length };
}

export async function readinessGates(): Promise<GateResult[]> {
  const examId = await getExamId();
  const g = PMP.readinessGates;
  const [overall] = await db
    .select({ n: sql<number>`count(*)`, correct: sql<number>`sum(case when ${attempts.isCorrect} then 1 else 0 end)` })
    .from(attempts)
    .where(eq(attempts.pretest, false));
  const n = Number(overall?.n ?? 0);
  const pct = n ? (Number(overall.correct) / n) * 100 : null;
  const domains = await domainAccuracy();
  const [studied] = await db
    .select({ total: sql<number>`count(*)`, studied: sql<number>`sum(case when ${syllabusItems.studied} then 1 else 0 end)` })
    .from(syllabusItems)
    .where(eq(syllabusItems.examId, examId));
  const [mocks] = await db
    .select({ n: sql<number>`count(*)` })
    .from(sessions)
    .where(and(eq(sessions.examId, examId), eq(sessions.kind, "mock"), isNotNull(sessions.endedAt)));
  return [
    { key: "overall", label: "Overall accuracy", ok: pct !== null && n >= SMALL_SAMPLE && pct >= g.overallPct, value: pct === null ? "—" : `${pct.toFixed(1)}%`, target: `≥ ${g.overallPct}%`, detail: n < SMALL_SAMPLE ? `${n} answered — needs ≥ ${SMALL_SAMPLE} to count` : `${n} answered` },
    {
      key: "domains",
      label: "Every domain",
      ok: domains.every((d) => d.pct !== null && d.n >= SMALL_SAMPLE && d.pct >= g.domainPct),
      value: domains.map((d) => `${d.label.split(" ")[0]} ${d.pct === null ? "—" : `${d.pct}%`}`).join(" · "),
      target: `each ≥ ${g.domainPct}%`,
    },
    { key: "studied", label: "Tasks studied", ok: Number(studied?.studied ?? 0) >= Number(studied?.total ?? 26), value: `${studied?.studied ?? 0}/${studied?.total ?? 26}`, target: "all 26" },
    { key: "mocks", label: "Full mocks completed", ok: Number(mocks?.n ?? 0) >= g.mocksRequired, value: String(mocks?.n ?? 0), target: `≥ ${g.mocksRequired}` },
  ];
}

/** Columns mirror the Excel tracker (DECISIONS #16). */
export async function attemptsCsv(): Promise<string> {
  const rows = await db
    .select({
      date: attempts.answeredAt,
      sessionId: attempts.sessionId,
      kind: sessions.kind,
      domain: questions.domain,
      task: syllabusItems.code,
      taskTitle: syllabusItems.title,
      questionId: attempts.questionId,
      itemType: questions.itemType,
      difficulty: questions.difficulty,
      style: questions.style,
      correct: attempts.isCorrect,
      family: attempts.distractorFamily,
      seconds: attempts.secondsSpent,
      confidence: attempts.confidence,
      pretest: attempts.pretest,
    })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .innerJoin(sessions, eq(sessions.id, attempts.sessionId))
    .innerJoin(syllabusItems, eq(syllabusItems.id, questions.syllabusItemId))
    .orderBy(desc(attempts.answeredAt));
  const header = ["Date", "Session", "Kind", "Domain", "ECO Task", "Task Title", "Question ID", "Item Type", "Difficulty", "Style", "Correct", "Distractor Family", "Seconds", "Confidence", "Pretest"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((r) =>
    [r.date.slice(0, 19).replace("T", " "), r.sessionId, r.kind, PMP.domainLabels[r.domain as keyof typeof PMP.domainLabels] ?? r.domain, r.task, r.taskTitle, r.questionId, r.itemType, r.difficulty, r.style, r.correct ? 1 : 0, r.family ?? "", r.seconds ?? "", r.confidence ?? "", r.pretest ? 1 : 0]
      .map(esc)
      .join(","),
  );
  // Baseline session has no attempt rows; emit one summary line so the workbook and the app agree on the first data point.
  const base = (await sessionScores()).find((s) => s.label === "Cold baseline");
  if (base) lines.push([`${base.date} 10:00:00`, base.sessionId, "mini", "Mixed", "", "Cold baseline (15 questions, 4 correct)", "", "", "", "", `${base.correct}/${base.questions}`, "", "", "", 0].map(esc).join(","));
  return [header.join(","), ...lines].join("\n") + "\n";
}
