/**
 * Exam simulator (build prompt §9): 180 questions / 240 minutes, two optional
 * 10-minute breaks, a case-study block that locks once you leave it, 170
 * scored + 10 unscored pretest items, no pause, server-side clock.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, caseQuestions, questions, sessions } from "@/db/schema";
import { getExamId } from "@/db/queries";
import { finishSession, loadQuestion, loadSession, saveState, type SessionState } from "@/lib/sessions";
import { scoreAnswer, type Chosen } from "@/lib/scoring";
import { readinessGates } from "@/lib/analytics";
import { PMP } from "../../config/exams/pmp";

export interface ExamState extends SessionState {
  pretestIds: number[];
  caseIds: number[];
  stage: "case" | "break1" | "main" | "break2" | "main2" | "done";
  caseLocked: boolean;
  deadlineAt: string;
  breaksTaken: number;
  breakUntil: string | null;
  answers: Record<string, Chosen>;
  flagged: number[];
  /** seconds spent per question, accumulated client-side and saved with each answer */
  times: Record<string, number>;
  /** where the second break is offered (index into order) */
  break2At: number;
  submittedAt?: string;
}

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick a 180-question paper honouring domain weights (41/33/26) and the 40/60 delivery split, case items first. */
export async function buildPaper(seed = Date.now() & 0xffff): Promise<{ order: number[]; caseIds: number[]; pretestIds: number[]; short: boolean }> {
  const examId = await getExamId();
  const pool = await db
    .select({ id: questions.id, domain: questions.domain, delivery: questions.deliveryApproach, itemType: questions.itemType })
    .from(questions)
    .where(and(eq(questions.examId, examId), eq(questions.status, "active")));
  const total = PMP.questionCount;
  const perDomain = Object.fromEntries(PMP.domains.map((d) => [d, Math.round((PMP.domainWeights[d] / 100) * total)])) as Record<string, number>;
  // fix rounding so the sum is exactly `total`
  const diff = total - Object.values(perDomain).reduce((a, b) => a + b, 0);
  perDomain[PMP.domains[1]] += diff;

  const chosen: typeof pool = [];
  for (const d of PMP.domains) {
    const cand = shuffle(pool.filter((q) => q.domain === d), seed + d.length);
    const want = perDomain[d];
    const predictiveWant = Math.round(want * 0.4);
    const pred = cand.filter((q) => q.delivery === "predictive").slice(0, predictiveWant);
    const rest = cand.filter((q) => !pred.includes(q)).slice(0, want - pred.length);
    chosen.push(...pred, ...rest);
  }
  // Case block first (linked cluster when case_studies exist, else the case-type items).
  const caseLinked = await db.select({ qid: caseQuestions.questionId, cs: caseQuestions.caseStudyId, seq: caseQuestions.sequence }).from(caseQuestions);
  let caseIds = chosen.filter((q) => caseLinked.some((c) => c.qid === q.id) || q.itemType === "case").map((q) => q.id);
  caseIds = caseIds.slice(0, Math.max(5, Math.min(15, caseIds.length)));
  const others = shuffle(chosen.filter((q) => !caseIds.includes(q.id)).map((q) => q.id), seed + 7);
  const order = [...caseIds, ...others];
  const pretestIds = shuffle(others, seed + 11).slice(0, Math.min(total - PMP.scoredCount, Math.max(0, order.length - PMP.scoredCount)));
  return { order, caseIds, pretestIds, short: order.length < total };
}

export async function createMock(): Promise<{ id: number; count: number; short: boolean }> {
  const examId = await getExamId();
  const paper = await buildPaper();
  if (paper.order.length < 20) throw new Error(`Only ${paper.order.length} active questions — a mock needs a fuller bank. Generate more first.`);
  const now = new Date();
  const state: ExamState = {
    order: paper.order,
    index: 0,
    answered: [],
    pretestIds: paper.pretestIds,
    caseIds: paper.caseIds,
    stage: paper.caseIds.length ? "case" : "main",
    caseLocked: paper.caseIds.length === 0,
    deadlineAt: new Date(now.getTime() + PMP.minutes * 60_000).toISOString(),
    breaksTaken: 0,
    breakUntil: null,
    answers: {},
    flagged: [],
    times: {},
    break2At: Math.floor(paper.order.length * (2 / 3)),
  };
  const [row] = await db
    .insert(sessions)
    .values({ examId, kind: "mock", startedAt: now.toISOString(), configJson: JSON.stringify({ questions: paper.order.length, minutes: PMP.minutes, short: paper.short }), stateJson: JSON.stringify(state) })
    .returning({ id: sessions.id });
  return { id: row.id, count: paper.order.length, short: paper.short };
}

export async function loadExam(id: number) {
  const loaded = await loadSession(id);
  if (!loaded || loaded.session.kind !== "mock") return null;
  return { session: loaded.session, state: loaded.state as ExamState };
}

export function timeLeftMs(state: ExamState, now = Date.now()): number {
  if (state.breakUntil) return Math.max(0, new Date(state.deadlineAt).getTime() - new Date(state.breakUntil).getTime() + 10 * 60_000);
  return Math.max(0, new Date(state.deadlineAt).getTime() - now);
}

/** Every mutation goes through here so the clock is enforced server-side. */
async function guardClock(id: number): Promise<{ state: ExamState; expired: boolean }> {
  const ex = await loadExam(id);
  if (!ex) throw new Error("mock not found");
  const { state } = ex;
  if (state.stage === "done") return { state, expired: false };
  if (state.breakUntil && new Date(state.breakUntil).getTime() < Date.now()) await endBreak(id, state);
  const expired = new Date(state.deadlineAt).getTime() <= Date.now() && !state.breakUntil;
  if (expired) await submitExam(id, "time");
  return { state, expired };
}

export async function saveAnswer(id: number, questionId: number, chosen: Chosen, secondsDelta: number) {
  const { state, expired } = await guardClock(id);
  if (expired || state.stage === "done") return { expired: true };
  const inCase = state.caseIds.includes(questionId);
  if (inCase && state.caseLocked) return { expired: false, locked: true };
  state.answers[String(questionId)] = chosen;
  state.times[String(questionId)] = (state.times[String(questionId)] ?? 0) + Math.max(0, secondsDelta);
  const idx = state.order.indexOf(questionId);
  if (idx >= 0) state.index = idx;
  await saveState(id, state);
  return { expired: false };
}

export async function toggleFlag(id: number, questionId: number) {
  const { state } = await guardClock(id);
  state.flagged = state.flagged.includes(questionId) ? state.flagged.filter((x) => x !== questionId) : [...state.flagged, questionId];
  await saveState(id, state);
}

export async function setIndex(id: number, index: number) {
  const { state } = await guardClock(id);
  const min = state.caseLocked ? state.caseIds.length : 0;
  state.index = Math.max(min, Math.min(state.order.length - 1, index));
  await saveState(id, state);
}

/** Leaving the case block is a one-way gate. Optionally start break 1. */
export async function lockCaseBlock(id: number, takeBreak: boolean) {
  const { state, expired } = await guardClock(id);
  if (expired) return;
  if (!state.caseLocked) {
    // Record case-block attempts now: they can never change.
    await recordAttempts(id, state, state.caseIds);
    state.caseLocked = true;
  }
  state.index = Math.max(state.index, state.caseIds.length);
  if (takeBreak && state.breaksTaken < PMP.breaks.count) {
    state.breaksTaken += 1;
    state.breakUntil = new Date(Date.now() + PMP.breaks.minutes * 60_000).toISOString();
    state.stage = "break1";
  } else {
    state.stage = "main";
  }
  await saveState(id, state);
}

export async function takeSecondBreak(id: number) {
  const { state, expired } = await guardClock(id);
  if (expired || state.breaksTaken >= PMP.breaks.count || state.breakUntil) return;
  state.breaksTaken += 1;
  state.breakUntil = new Date(Date.now() + PMP.breaks.minutes * 60_000).toISOString();
  state.stage = "break2";
  await saveState(id, state);
}

export async function endBreak(id: number, stateIn?: ExamState) {
  const ex = stateIn ? { state: stateIn } : await loadExam(id);
  if (!ex) return;
  const { state } = ex;
  if (!state.breakUntil) return;
  // The clock does not run during a break: push the deadline out by the break actually used (≤ 10 min).
  const started = new Date(state.breakUntil).getTime() - PMP.breaks.minutes * 60_000;
  const used = Math.min(PMP.breaks.minutes * 60_000, Math.max(0, Date.now() - started));
  state.deadlineAt = new Date(new Date(state.deadlineAt).getTime() + used).toISOString();
  state.breakUntil = null;
  state.stage = state.stage === "break1" ? "main" : "main2";
  await saveState(id, state);
}

async function recordAttempts(id: number, state: ExamState, ids: number[]) {
  const [s] = await db.select({ examId: sessions.examId }).from(sessions).where(eq(sessions.id, id)).limit(1);
  const already = new Set((await db.select({ q: attempts.questionId }).from(attempts).where(and(eq(attempts.sessionId, id), inArray(attempts.questionId, ids.length ? ids : [-1])))).map((r) => r.q));
  for (const qid of ids) {
    if (already.has(qid)) continue;
    const lq = await loadQuestion(qid);
    if (!lq) continue;
    const chosen = state.answers[String(qid)] ?? null;
    const score = scoreAnswer(lq.question.itemType, lq.options, lq.exhibit, chosen);
    await db.insert(attempts).values({
      examId: s.examId,
      sessionId: id,
      questionId: qid,
      chosenOptionIdsJson: JSON.stringify(chosen),
      isCorrect: score.isCorrect,
      distractorFamily: score.family,
      secondsSpent: Math.round(state.times[String(qid)] ?? 0) || null,
      confidence: null,
      pretest: state.pretestIds.includes(qid),
    });
    if (!state.answered.includes(qid)) state.answered.push(qid);
  }
}

export async function submitExam(id: number, reason: "user" | "time" = "user") {
  const ex = await loadExam(id);
  if (!ex) return;
  const { state } = ex;
  if (state.stage === "done") return;
  await recordAttempts(id, state, state.order);
  state.stage = "done";
  state.breakUntil = null;
  state.submittedAt = new Date().toISOString();
  (state as ExamState & { endReason?: string }).endReason = reason;
  await saveState(id, state);
  await finishSession(id);
}

export interface MockResults {
  overall: { n: number; correct: number; pct: number };
  pretest: { n: number; correct: number };
  byDomain: Array<{ domain: string; label: string; n: number; correct: number; pct: number | null }>;
  byTask: Array<{ id: number; code: string; title: string; n: number; correct: number; pct: number | null }>;
  families: Array<{ family: string; label: string; count: number }>;
  pace: { median: number | null; buckets: Array<{ label: string; count: number }>; over: number; total: number };
  verdict: { go: boolean; reasons: string[] };
  minutesUsed: number;
}

export async function mockResults(id: number): Promise<MockResults | null> {
  const ex = await loadExam(id);
  if (!ex) return null;
  const rows = await db
    .select({
      isCorrect: attempts.isCorrect,
      pretest: attempts.pretest,
      family: attempts.distractorFamily,
      seconds: attempts.secondsSpent,
      domain: questions.domain,
      item: questions.syllabusItemId,
    })
    .from(attempts)
    .innerJoin(questions, eq(questions.id, attempts.questionId))
    .where(eq(attempts.sessionId, id));
  const scored = rows.filter((r) => !r.pretest);
  const pre = rows.filter((r) => r.pretest);
  const pct = scored.length ? Math.round((scored.filter((r) => r.isCorrect).length / scored.length) * 1000) / 10 : 0;
  const byDomain = PMP.domains.map((d) => {
    const rs = scored.filter((r) => r.domain === d);
    const c = rs.filter((r) => r.isCorrect).length;
    return { domain: d, label: PMP.domainLabels[d], n: rs.length, correct: c, pct: rs.length ? Math.round((c / rs.length) * 1000) / 10 : null };
  });
  const byTask = PMP.syllabus.map((it) => {
    const rs = scored.filter((r) => r.item === it.id);
    const c = rs.filter((r) => r.isCorrect).length;
    return { id: it.id, code: it.code, title: it.title, n: rs.length, correct: c, pct: rs.length ? Math.round((c / rs.length) * 100) : null };
  });
  const fam = new Map<string, number>();
  for (const r of scored) if (!r.isCorrect && r.family) fam.set(r.family, (fam.get(r.family) ?? 0) + 1);
  const families = [...fam.entries()].map(([family, count]) => ({ family, label: PMP.familyRules[family]?.label ?? family, count })).sort((a, b) => b.count - a.count);
  const secs = rows.map((r) => r.seconds ?? 0).filter((s) => s > 0).sort((a, b) => a - b);
  const edges = [30, 60, 80, 120, 180];
  const buckets = [...edges, Infinity].map((e, i) => ({ label: i === 0 ? `<${e}s` : e === Infinity ? `>${edges[i - 1]}s` : `${edges[i - 1]}–${e}s`, count: secs.filter((s) => s >= (i === 0 ? 0 : edges[i - 1]) && s < e).length }));
  const reasons: string[] = [];
  if (pct < PMP.readinessGates.overallPct) reasons.push(`overall ${pct}% < ${PMP.readinessGates.overallPct}%`);
  for (const d of byDomain) if (d.pct !== null && d.pct < PMP.readinessGates.domainPct) reasons.push(`${d.label} ${d.pct}% < ${PMP.readinessGates.domainPct}%`);
  const gates = await readinessGates();
  const mocksGate = gates.find((g) => g.key === "mocks");
  if (mocksGate && !mocksGate.ok) reasons.push(`${mocksGate.value} full mock(s) completed; gate needs ${mocksGate.target}`);
  const startedAt = new Date(ex.session.startedAt).getTime();
  const endedAt = ex.session.endedAt ? new Date(ex.session.endedAt).getTime() : Date.now();
  return {
    overall: { n: scored.length, correct: scored.filter((r) => r.isCorrect).length, pct },
    pretest: { n: pre.length, correct: pre.filter((r) => r.isCorrect).length },
    byDomain,
    byTask,
    families,
    pace: { median: secs.length ? secs[Math.floor(secs.length / 2)] : null, buckets, over: secs.filter((s) => s > PMP.pacingSecondsPerQuestion).length, total: secs.length },
    verdict: { go: reasons.length === 0, reasons },
    minutesUsed: Math.round((endedAt - startedAt) / 60_000),
  };
}

export async function activeQuestionCount(): Promise<number> {
  const examId = await getExamId();
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(questions).where(and(eq(questions.examId, examId), eq(questions.status, "active")));
  return Number(r?.n ?? 0);
}
