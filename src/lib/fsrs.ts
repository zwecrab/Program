/**
 * FSRS scheduling for flashcards (build prompt §8.6) via ts-fsrs. The DB keeps
 * the minimal state (stability, difficulty, state, due, reps, lapses,
 * last_review); everything else is derived.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { Flashcard } from "@/db/schema";

const scheduler = fsrs(generatorParameters({ enable_fuzz: true, enable_short_term: true }));

export const GRADES = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;
export type GradeName = keyof typeof GRADES;

export function toCard(f: Flashcard): Card {
  if (f.reps === 0 && f.fsrsState === 0) return createEmptyCard(new Date(f.dueAt));
  const last = f.lastReviewAt ? new Date(f.lastReviewAt) : undefined;
  const due = new Date(f.dueAt);
  return {
    due,
    stability: f.fsrsStability,
    difficulty: f.fsrsDifficulty,
    elapsed_days: last ? Math.max(0, Math.round((Date.now() - last.getTime()) / 86_400_000)) : 0,
    scheduled_days: last ? Math.max(0, Math.round((due.getTime() - last.getTime()) / 86_400_000)) : 0,
    learning_steps: 0,
    reps: f.reps,
    lapses: f.lapses,
    state: f.fsrsState as State,
    last_review: last,
  };
}

export interface Scheduled {
  fsrsStability: number;
  fsrsDifficulty: number;
  fsrsState: number;
  dueAt: string;
  lastReviewAt: string;
  reps: number;
  lapses: number;
}

export function schedule(f: Flashcard, grade: GradeName, now = new Date()): Scheduled {
  const next = scheduler.next(toCard(f), now, GRADES[grade] as Grade).card;
  return {
    fsrsStability: next.stability,
    fsrsDifficulty: next.difficulty,
    fsrsState: next.state,
    dueAt: next.due.toISOString(),
    lastReviewAt: now.toISOString(),
    reps: next.reps,
    lapses: next.lapses,
  };
}

/** Preview the four intervals so the buttons can show "10m · 1d · 4d · 12d". */
export function previewIntervals(f: Flashcard, now = new Date()): Record<GradeName, string> {
  const rec = scheduler.repeat(toCard(f), now);
  const fmt = (d: Date) => {
    const mins = Math.round((d.getTime() - now.getTime()) / 60_000);
    if (mins < 60) return `${Math.max(1, mins)}m`;
    if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
    return `${Math.round(mins / 1440)}d`;
  };
  return { again: fmt(rec[Rating.Again].card.due), hard: fmt(rec[Rating.Hard].card.due), good: fmt(rec[Rating.Good].card.due), easy: fmt(rec[Rating.Easy].card.due) };
}
