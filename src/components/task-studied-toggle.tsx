"use client";

import { useTransition } from "react";
import { toggleTaskStudied } from "@/app/actions";
import { Button } from "@/components/ui";

export function TaskStudiedToggle({ taskId, studied, labels }: { taskId: number; studied: boolean; labels: { studied: string; mark: string } }) {
  const [pending, start] = useTransition();
  return (
    <Button variant={studied ? "secondary" : "default"} disabled={pending} aria-pressed={studied} onClick={() => start(() => toggleTaskStudied(taskId, !studied))}>
      {studied ? `${labels.studied} ✓` : labels.mark}
    </Button>
  );
}
