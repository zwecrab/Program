"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";
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
        "flex shrink-0 items-center justify-center rounded-full border transition-colors",
        compact ? "mt-0.5 h-6 w-6" : "h-10 w-10",
        done ? "border-correct bg-correct text-white" : "border-border-strong bg-surface text-fg-faint hover:border-accent",
        pending && "opacity-50",
      )}
    >
      {done ? <Check size={compact ? 14 : 18} /> : null}
    </button>
  );
}
