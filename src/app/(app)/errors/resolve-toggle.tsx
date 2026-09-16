"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui";
import { resolveReviewItem } from "@/app/session-actions";

export function ResolveToggle({ id, resolved }: { id: number; resolved: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant={resolved ? "ghost" : "secondary"} disabled={pending} onClick={() => start(() => resolveReviewItem(id, !resolved))}>
      {resolved ? "Reopen" : "Resolve"}
    </Button>
  );
}
