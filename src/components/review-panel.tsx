"use client";

/**
 * The answer-review screen — the most important screen in the app (Phase 2
 * brief §19). Shows: your answer, the correct answer, a rationale for every
 * option, the distractor family you fell for (with the rule it breaks), the
 * PMBOK citation strip, and one action: add to review items.
 */
import { useState, useTransition } from "react";
import { Check, X, Lightbulb } from "lucide-react";
import { Button, Card, CardTitle, Badge } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { CitationStrip } from "@/components/citations";
import { addReviewItem, type ReviewPayload } from "@/app/session-actions";
import type { PlayerQuestion } from "@/components/question-player";
import type { Chosen } from "@/lib/scoring";
import type { Citation } from "@/lib/retrieval";
import { cn } from "@/lib/utils";

export function ReviewPanel({ q, review, chosen, onNext, nextLabel }: { q: PlayerQuestion; review: ReviewPayload; chosen: Chosen; onNext: () => void; nextLabel: string }) {
  const [added, setAdded] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [alt, setAlt] = useState<{ md: string; citations: Citation[]; support: "high" | "medium" | "low" } | null>(null);
  const [altBusy, setAltBusy] = useState(false);
  const [altErr, setAltErr] = useState<string | null>(null);
  const chosenIds = new Set(Array.isArray(chosen) ? chosen : []);
  const yourAnswer = Array.isArray(chosen)
    ? q.options.filter((o) => chosenIds.has(o.id)).map((o) => o.label).join(", ") || "—"
    : typeof chosen === "string"
      ? q.exhibit?.kind === "point_and_click"
        ? q.exhibit.regions.find((r) => r.id === chosen)?.label ?? chosen
        : chosen
      : chosen
        ? Object.values(chosen).length
          ? "see parts below"
          : "—"
        : "—";

  async function explain() {
    setAltBusy(true);
    setAltErr(null);
    const res = await fetch(`/api/explain/${q.id}`, { method: "POST" });
    const j = (await res.json().catch(() => ({}))) as { md?: string; citations?: Citation[]; support?: "high" | "medium" | "low"; error?: string };
    setAltBusy(false);
    if (!res.ok || !j.md) setAltErr(j.error ?? "Could not explain right now.");
    else setAlt({ md: j.md, citations: j.citations ?? [], support: j.support ?? "medium" });
  }

  return (
    <div className="space-y-4">
      <div className={cn("flex items-center gap-3 rounded-lg p-4", review.isCorrect ? "bg-correct-soft" : "bg-incorrect-soft")}>
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white", review.isCorrect ? "bg-correct" : "bg-incorrect")}>{review.isCorrect ? <Check size={22} /> : <X size={22} />}</span>
        <div className="min-w-0">
          <p className="font-display text-xl">{review.isCorrect ? "Correct" : "Incorrect"}</p>
          <p className="text-sm text-fg-muted">
            Your answer: <strong className="text-fg">{yourAnswer}</strong> · Correct: <strong className="text-fg">{review.correctKey}</strong>
          </p>
        </div>
      </div>

      {!review.isCorrect && review.family ? (
        <Card className="border-incorrect/40 p-4">
          <CardTitle>Distractor family you fell for</CardTitle>
          <p className="font-display mt-1 text-lg">{review.familyLabel}</p>
          <p className="mt-1 text-sm text-fg-muted">
            <Badge tone="incorrect" className="mr-2">
              {review.family}
            </Badge>
            {review.rule}
          </p>
        </Card>
      ) : null}

      <p className="prose-reading text-base text-fg-muted">{q.stem}</p>

      {review.options.length ? (
        <ul className="space-y-2">
          {review.options.map((o) => {
            const picked = chosenIds.has(o.id);
            return (
              <li key={o.id} className={cn("rounded-lg border p-3", o.isCorrect ? "border-correct bg-correct-soft/40" : picked ? "border-incorrect bg-incorrect-soft/40" : "border-border")}>
                <div className="flex items-start gap-3">
                  <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", o.isCorrect ? "bg-correct text-white" : picked ? "bg-incorrect text-white" : "border border-border-strong text-fg-muted")}>{o.label}</span>
                  <div className="min-w-0 flex-1">
                    <p className="prose-reading">{o.body}</p>
                    <p className="mt-1 text-sm text-fg-muted">
                      {o.family ? <Badge tone="outline" className="mr-1">{o.family}</Badge> : <Badge tone="correct" className="mr-1">correct</Badge>}
                      {o.rationale}
                    </p>
                  </div>
                  {picked ? <Badge tone={o.isCorrect ? "correct" : "incorrect"}>you</Badge> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {review.exhibitRationales.length ? (
        <ul className="space-y-2">
          {review.exhibitRationales.map((r, i) => (
            <li key={i} className={cn("rounded-lg border p-3 text-sm", r.correct ? "border-correct/50" : "border-border")}>
              <p className="font-medium">{r.label}</p>
              <p className="mt-0.5 text-fg-muted">
                {r.family ? <Badge tone="outline" className="mr-1">{r.family}</Badge> : <Badge tone="correct" className="mr-1">correct</Badge>}
                {r.rationale}
              </p>
            </li>
          ))}
          {review.parts?.length ? (
            <li className="text-xs text-fg-muted">
              Your parts: {review.parts.map((p) => `${p.id} ${p.correct ? "✓" : "✗"}`).join(" · ")}
            </li>
          ) : null}
        </ul>
      ) : null}

      {review.explanationMd ? (
        <Card className="p-4">
          <CardTitle>Why</CardTitle>
          <Markdown className="mt-1 text-base">{review.explanationMd}</Markdown>
          {review.pmbokRef ? <p className="mt-2 text-xs text-fg-muted">PMBOK 8: {review.pmbokRef}</p> : null}
          <CitationStrip citations={review.citations} support={review.support} className="mt-3" />
        </Card>
      ) : null}

      {!review.isCorrect ? (
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="soft" size="sm" onClick={explain} disabled={altBusy || !!alt}>
              <Lightbulb size={14} /> {altBusy ? "Thinking…" : alt ? "Explained" : "Explain this differently"}
            </Button>
            <span className="text-xs text-fg-muted">One LLM call, cached for this question.</span>
          </div>
          {altErr ? <p className="mt-2 text-sm text-incorrect">{altErr}</p> : null}
          {alt ? (
            <div className="mt-3">
              <Markdown className="text-base">{alt.md}</Markdown>
              <CitationStrip citations={alt.citations} support={alt.support} className="mt-3" />
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to self (optional)"
            className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-sm"
            disabled={added}
          />
          <Button
            variant={added ? "secondary" : "default"}
            disabled={added || pending}
            onClick={() =>
              start(async () => {
                await addReviewItem(q.id, review.family, note);
                setAdded(true);
              })
            }
          >
            {added ? "Added to review items ✓" : "Add to review items"}
          </Button>
        </div>
        {review.rule && !added ? <p className="mt-2 text-xs text-fg-muted">Will be filed under: {review.rule}</p> : null}
      </Card>

      <div className="flex justify-end">
        <Button size="lg" onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    </div>
  );
}
