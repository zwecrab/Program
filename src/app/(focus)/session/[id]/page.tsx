import { notFound, redirect } from "next/navigation";
import { loadQuestion, loadSession } from "@/lib/sessions";
import { PracticeRunner } from "./runner";
import { PMP } from "../../../../../config/exams/pmp";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = Number(id);
  const loaded = await loadSession(sid);
  if (!loaded) notFound();
  const { session, state, config } = loaded;
  if (session.kind === "mock") redirect(`/exam/${sid}`);
  if (session.endedAt || state.index >= state.order.length) redirect(`/session/${sid}/summary`);

  const qid = state.order[state.index];
  const lq = await loadQuestion(qid);
  if (!lq) redirect(`/session/${sid}/summary`);

  return (
    <PracticeRunner
      sessionId={sid}
      index={state.index}
      total={state.order.length}
      timed={!!config.timed}
      secondsPerQuestion={Number(config.secondsPerQuestion) || PMP.pacingSecondsPerQuestion}
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
