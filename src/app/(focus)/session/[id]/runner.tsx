"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { QuestionPlayer, type PlayerQuestion } from "@/components/question-player";
import { ReviewPanel } from "@/components/review-panel";
import { submitAnswer, type ReviewPayload } from "@/app/session-actions";
import type { Chosen } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export function PracticeRunner({ sessionId, index, total, timed, secondsPerQuestion, q }: { sessionId: number; index: number; total: number; timed: boolean; secondsPerQuestion: number; q: PlayerQuestion }) {
  const router = useRouter();
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const started = useRef(Date.now());
  const chosenRef = useRef<Chosen>(null);

  useEffect(() => {
    started.current = Date.now();
    setElapsed(0);
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [q.id]);

  const remaining = secondsPerQuestion - elapsed;

  async function submit(chosen: Chosen) {
    chosenRef.current = chosen;
    setSubmitting(true);
    const r = await submitAnswer(sessionId, q.id, chosen, Math.floor((Date.now() - started.current) / 1000), confidence);
    setReview(r);
    setSubmitting(false);
  }

  // Timed mode: auto-submit whatever is selected when the clock runs out.
  useEffect(() => {
    if (timed && !review && remaining <= 0 && !submitting) {
      submit(chosenRef.current ?? (["single", "multi", "graphic", "case"].includes(q.itemType) ? [] : null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, timed, review, submitting]);

  function next() {
    if (review?.done) router.push(`/session/${sessionId}/summary`);
    else {
      setReview(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-sunken">
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(index / total) * 100}%` }} />
        </div>
        {timed ? (
          <span className={cn("ml-3 tabular text-sm", remaining <= 10 && !review ? "text-incorrect font-semibold" : "text-fg-muted")}>{review ? `${elapsed}s` : `${Math.max(0, remaining)}s`}</span>
        ) : (
          <span className="ml-3 tabular text-sm text-fg-muted">{elapsed}s</span>
        )}
        <Link href="/practice" className="ml-3 rounded-md p-1 text-fg-muted hover:bg-bg-sunken" aria-label="Leave session">
          <X size={18} />
        </Link>
      </div>

      {!review ? (
        <>
          <QuestionPlayer q={q} index={index} total={total} onSubmit={submit} submitting={submitting} />
          <div className="flex items-center justify-end gap-2 text-xs text-fg-muted">
            <span>Confidence:</span>
            {[1, 2, 3].map((c) => (
              <button key={c} onClick={() => setConfidence(c)} className={cn("rounded-full border px-2 py-0.5", confidence === c ? "border-accent bg-accent-soft text-accent-soft-fg" : "border-border")}>
                {c === 1 ? "guess" : c === 2 ? "fairly sure" : "sure"}
              </button>
            ))}
          </div>
        </>
      ) : (
        <ReviewPanel q={q} review={review} chosen={chosenRef.current} onNext={next} nextLabel={review.done ? "See summary" : "Next question"} />
      )}
    </div>
  );
}
