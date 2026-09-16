"use client";

import { useTransition } from "react";
import { toggleTaskStudied } from "@/app/actions";
import { Button } from "@/components/ui";

export function TaskStudiedToggle({ taskId, studied }: { taskId: number; studied: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={studied ? "secondary" : "primary"}
      disabled={pending}
      aria-pressed={studied}
      onClick={() => start(() => toggleTaskStudied(taskId, !studied))}
    >
      {studied ? "Studied ✓" : "Mark studied"}
    </Button>
  );
}
