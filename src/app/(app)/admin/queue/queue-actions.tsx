"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { setQuestionStatus } from "../actions";

export function QueueActions({ id, status }: { id: number; status: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      {status !== "active" ? (
        <Button size="sm" disabled={pending} onClick={() => start(() => setQuestionStatus(id, "active"))}>
          Approve
        </Button>
      ) : (
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => start(() => setQuestionStatus(id, "quarantined"))}>
          Pull from bank
        </Button>
      )}
      {status !== "retired" ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(() => setQuestionStatus(id, "retired"))}>
          Bin
        </Button>
      ) : null}
    </div>
  );
}
