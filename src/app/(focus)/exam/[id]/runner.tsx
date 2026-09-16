"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Button, Card, Dialog, DialogContent } from "@/components/ui";
import { QuestionPlayer, type PlayerQuestion } from "@/components/question-player";
import { examEndBreak, examLockCase, examSaveAnswer, examSecondBreak, examSetIndex, examSubmit, examToggleFlag } from "@/app/exam-actions";
import type { Chosen } from "@/lib/scoring";
import { cn } from "@/lib/utils";

interface Props {
  sessionId: number;
  index: number;
  total: number;
  caseCount: number;
  caseLocked: boolean;
  inCase: boolean;
  timeLeftMs: number;
  breakUntil: string | null;
  breaksLeft: number;
  break2At: number;
  flagged: number[];
  answeredIds: number[];
  order: number[];
  initial: Chosen;
  q: PlayerQuestion;
}

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function ExamRunner(p: Props) {
  const router = useRouter();
  const [left, setLeft] = useState(p.timeLeftMs);
  const [breakLeft, setBreakLeft] = useState(p.breakUntil ? new Date(p.breakUntil).getTime() - Date.now() : 0);
  const [gate, setGate] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());
  const deadline = useRef(Date.now() + p.timeLeftMs);

  useEffect(() => {
    deadline.current = Date.now() + p.timeLeftMs;
    started.current = Date.now();
    const t = setInterval(() => {
      if (p.breakUntil) setBreakLeft(new Date(p.breakUntil).getTime() - Date.now());
      else setLeft(deadline.current - Date.now());
    }, 500);
    return () => clearInterval(t);
  }, [p.timeLeftMs, p.breakUntil, p.q.id]);

  // Time out → server submits; we just navigate.
  useEffect(() => {
    if (!p.breakUntil && left <= 0) {
      examSubmit(p.sessionId).catch(() => router.push(`/exam/${p.sessionId}/results`));
    }
  }, [left, p.breakUntil, p.sessionId, router]);

  useEffect(() => {
    if (p.breakUntil && breakLeft <= 0) {
      examEndBreak(p.sessionId).then(() => router.refresh());
    }
  }, [breakLeft, p.breakUntil, p.sessionId, router]);

  const secondsHere = () => Math.floor((Date.now() - started.current) / 1000);

  async function saveAndGo(chosen: Chosen, delta: number) {
    setBusy(true);
    const r = await examSaveAnswer(p.sessionId, p.q.id, chosen, secondsHere());
    if (r.expired) return router.push(`/exam/${p.sessionId}/results`);
    const next = p.index + delta;
    const isLastCase = p.inCase && next >= p.caseCount;
    if (isLastCase && !p.caseLocked) {
      setBusy(false);
      setGate(true);
      return;
    }
    if (next >= p.total) {
      setBusy(false);
      setConfirmSubmit(true);
      return;
    }
    await examSetIndex(p.sessionId, next);
    setBusy(false);
    router.refresh();
  }

  async function jump(to: number) {
    setBusy(true);
    await examSetIndex(p.sessionId, to);
    setBusy(false);
    router.refresh();
  }

  const lowTime = left < 10 * 60_000;

  if (p.breakUntil) {
    return (
      <Card className="mx-auto mt-16 max-w-md p-8 text-center">
        <p className="text-xs uppercase tracking-[0.08em] text-fg-muted">Break</p>
        <p className="font-display mt-2 text-5xl tabular">{fmt(breakLeft)}</p>
        <p className="mt-2 text-sm text-fg-muted">The exam clock is stopped. {p.caseLocked ? "The case-study block is now locked." : ""}</p>
        <Button className="mt-6" size="lg" onClick={() => examEndBreak(p.sessionId).then(() => router.refresh())}>
          End break early
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className={cn("font-display tabular text-2xl", lowTime && "text-incorrect")}>{fmt(left)}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-sunken">
          <div className="h-full rounded-full bg-accent" style={{ width: `${((p.index + 1) / p.total) * 100}%` }} />
        </div>
        <span className="text-xs text-fg-muted">
          {p.inCase ? (
            <span className="inline-flex items-center gap-1">
              <Lock size={12} /> case block
            </span>
          ) : (
            "main section"
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setConfirmSubmit(true)}>
          Submit
        </Button>
      </div>

      <QuestionPlayer key={p.q.id} q={p.q} index={p.index} total={p.total} onSubmit={(c) => saveAndGo(c, 1)} submitting={busy} submitLabel={p.index + 1 >= p.total ? "Save & finish" : "Save & next"} hideMeta initial={p.initial} />

      <div className="flex items-center justify-between gap-2 text-sm">
        <Button variant="secondary" size="sm" disabled={busy || p.index <= (p.caseLocked ? p.caseCount : 0)} onClick={() => jump(p.index - 1)}>
          <ChevronLeft size={16} /> Prev
        </Button>
        <button
          onClick={() => examToggleFlag(p.sessionId, p.q.id).then(() => router.refresh())}
          className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", p.flagged.includes(p.q.id) ? "bg-warn-soft text-fg" : "text-fg-muted hover:bg-bg-sunken")}
        >
          <Flag size={14} /> {p.flagged.includes(p.q.id) ? "Flagged" : "Flag"}
        </button>
        {!p.caseLocked && p.inCase ? (
          <Button variant="soft" size="sm" onClick={() => setGate(true)}>
            Finish case block…
          </Button>
        ) : p.breaksLeft > 0 && p.index >= p.break2At ? (
          <Button variant="soft" size="sm" onClick={() => examSecondBreak(p.sessionId).then(() => router.refresh())}>
            Take a 10-min break
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" disabled={busy || p.index + 1 >= p.total || (p.inCase && p.index + 1 >= p.caseCount && !p.caseLocked)} onClick={() => jump(p.index + 1)}>
          Skip <ChevronRight size={16} />
        </Button>
      </div>

      {/* Question map for the current section */}
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: p.total }, (_, i) => i)
          .filter((i) => (p.caseLocked ? i >= p.caseCount : p.inCase ? i < p.caseCount : i >= p.caseCount))
          .map((i) => (
            <button
              key={i}
              onClick={() => jump(i)}
              className={cn(
                "h-6 w-6 rounded text-[10px] tabular",
                i === p.index
                  ? "bg-accent text-accent-fg"
                  : p.flagged.includes(p.order[i])
                    ? "bg-warn-soft text-fg"
                    : p.answeredIds.includes(p.order[i])
                      ? "bg-accent-soft text-accent-soft-fg"
                      : "bg-bg-sunken text-fg-muted",
              )}
              title={`Question ${i + 1}`}
            >
              {i + 1}
            </button>
          ))}
      </div>

      <Dialog open={gate} onOpenChange={setGate}>
        <DialogContent title="Leave the case-study block?">
          <p className="text-sm text-fg-muted">Once you leave, the case-study questions lock and cannot be reopened — exactly like the real exam. You may take your first 10-minute break now; the clock stops during it.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setGate(false)}>
              Stay
            </Button>
            <Button variant="secondary" onClick={() => examLockCase(p.sessionId, false).then(() => router.refresh())}>
              Lock & continue
            </Button>
            <Button onClick={() => examLockCase(p.sessionId, true).then(() => router.refresh())} disabled={p.breaksLeft === 0}>
              Lock & take break
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <DialogContent title="Submit the exam?">
          <p className="text-sm text-fg-muted">
            {p.answeredIds.length} of {p.total} answered{p.flagged.length ? ` · ${p.flagged.length} flagged` : ""}. Unanswered questions score as wrong.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmSubmit(false)}>
              Keep going
            </Button>
            <Button onClick={() => examSubmit(p.sessionId)}>Submit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
