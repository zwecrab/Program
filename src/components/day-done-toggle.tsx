"use client";

import { useTransition } from "react";
import { toggleStudyDay } from "@/app/actions";
import { cn } from "@/lib/utils";

export function DayDoneToggle({ day, done, compact = false }: { day: number; done: boolean; compact?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={`Mark day ${day} ${done ? "not done" : "done"}`}
      disabled={pending}
      onClick={() => start(() => toggleStudyDay(day, !done))}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border transition",
        compact ? "h-7 w-7" : "h-10 w-10",
        done ? "border-success bg-success text-white" : "border-border bg-card text-muted hover:border-primary",
        pending && "opacity-50",
      )}
    >
      {done ? "✓" : ""}
    </button>
  );
}
