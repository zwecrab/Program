import { notFound, redirect } from "next/navigation";
import { loadExam, timeLeftMs } from "@/lib/exam";
import { loadQuestion } from "@/lib/sessions";
import { ExamRunner } from "./runner";
import { PMP } from "../../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

export default async function ExamRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = Number(id);
  const ex = await loadExam(sid);
  if (!ex) notFound();
  const { state } = ex;
  if (state.stage === "done") redirect(`/exam/${sid}/results`);
  const minIndex = state.caseLocked ? state.caseIds.length : 0;
  const index = Math.max(minIndex, Math.min(state.order.length - 1, state.index));
  const qid = state.order[index];
  const lq = await loadQuestion(qid);
  if (!lq) redirect(`/exam/${sid}/results`);

  return (
    <ExamRunner
      sessionId={sid}
      index={index}
      total={state.order.length}
      caseCount={state.caseIds.length}
      caseLocked={state.caseLocked}
      inCase={state.caseIds.includes(qid)}
      timeLeftMs={timeLeftMs(state)}
      breakUntil={state.breakUntil}
      breaksLeft={PMP.breaks.count - state.breaksTaken}
      break2At={state.break2At}
      flagged={state.flagged}
      answeredIds={Object.keys(state.answers).map(Number)}
      order={state.order}
      initial={state.answers[String(qid)] ?? null}
      q={{
        id: lq.question.id,
        itemType: lq.question.itemType,
        stem: lq.question.stem,
        exhibit: lq.exhibit,
        options: lq.options.map((o) => ({ id: o.id, label: o.label, body: o.body })),
        taskCode: lq.taskCode,
        taskTitle: lq.taskTitle,
        difficulty: lq.question.difficulty,
        deliveryApproach: lq.question.deliveryApproach,
      }}
    />
  );
}
