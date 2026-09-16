"use client";

import { useState, useTransition } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { gradeFlashcard } from "@/app/flashcard-actions";
import type { GradeName } from "@/lib/fsrs";
import { cn } from "@/lib/utils";

interface DeckCard {
  id: number;
  front: string;
  back: string;
  cardType: string;
  task: string;
  intervals: Record<GradeName, string>;
}

export function FlashcardDeck({ cards, labels }: { cards: DeckCard[]; labels: Record<"again" | "hard" | "good" | "easy" | "show", string> }) {
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pending, start] = useTransition();
  const [graded, setGraded] = useState<Record<GradeName, number>>({ again: 0, hard: 0, good: 0, easy: 0 });
  const card = cards[i];

  if (!card) {
    return (
      <Card className="p-6 text-center">
        <p className="font-display text-2xl">Deck done</p>
        <p className="mt-1 text-sm text-fg-muted">
          {cards.length} cards · again {graded.again} · hard {graded.hard} · good {graded.good} · easy {graded.easy}
        </p>
        <Button className="mt-4" variant="secondary" onClick={() => location.reload()}>
          Check for more
        </Button>
      </Card>
    );
  }

  const grade = (g: GradeName) =>
    start(async () => {
      await gradeFlashcard(card.id, g);
      setGraded((x) => ({ ...x, [g]: x[g] + 1 }));
      setRevealed(false);
      setI((x) => x + 1);
    });

  const tones: Record<GradeName, string> = { again: "bg-incorrect text-white", hard: "bg-warn-soft text-fg", good: "bg-accent text-accent-fg", easy: "bg-correct text-white" };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span className="tabular">
          {i + 1} / {cards.length}
        </span>
        <span className="truncate">{card.task}</span>
        <Badge>{card.cardType}</Badge>
      </div>
      <Card
        role="button"
        tabIndex={0}
        onClick={() => setRevealed(true)}
        onKeyDown={(e) => e.key === " " && setRevealed(true)}
        className={cn("min-h-56 cursor-pointer p-6 transition-colors", revealed && "bg-surface-raised")}
      >
        <p className="prose-reading font-display text-2xl">{card.front}</p>
        {revealed ? (
          <>
            <div className="my-4 h-px bg-border" />
            <p className="prose-reading text-lg">{card.back}</p>
          </>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">{labels.show} — tap or press space</p>
        )}
      </Card>
      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {(["again", "hard", "good", "easy"] as GradeName[]).map((g) => (
            <button key={g} disabled={pending} onClick={() => grade(g)} className={cn("flex flex-col items-center rounded-lg py-3 text-sm font-medium disabled:opacity-50", tones[g])}>
              {labels[g]}
              <span className="mt-0.5 text-[11px] opacity-80 tabular">{card.intervals[g]}</span>
            </button>
          ))}
        </div>
      ) : (
        <Button size="lg" className="w-full" variant="secondary" onClick={() => setRevealed(true)}>
          {labels.show}
        </Button>
      )}
    </div>
  );
}
