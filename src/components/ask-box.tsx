"use client";

import { useState } from "react";
import { Button, Card, CardTitle, Textarea } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { CitationStrip } from "@/components/citations";
import type { Citation } from "@/lib/retrieval";
import type { SupportLevel } from "@/db/schema";

interface Answer {
  found: boolean;
  md: string;
  citations: Citation[];
  support: SupportLevel;
}

export function AskBox({ syllabusItemId, title, placeholder }: { syllabusItemId?: number; title: string; placeholder: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q, syllabusItemId }) });
    const j = (await res.json().catch(() => ({}))) as Partial<Answer> & { error?: string };
    setBusy(false);
    if (!res.ok) setError(j.error ?? "Something went wrong.");
    else setAnswer(j as Answer);
  }

  return (
    <Card className="p-4">
      <CardTitle>{title}</CardTitle>
      <p className="mb-2 mt-1 text-xs text-fg-muted">Answers come only from your indexed materials, with page citations. One LLM call per question; counts toward the monthly cap.</p>
      <Textarea value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} rows={2} />
      <div className="mt-2 flex justify-end">
        <Button onClick={submit} disabled={busy || q.trim().length < 3} size="sm">
          {busy ? "Searching…" : "Ask"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-sm text-incorrect">{error}</p> : null}
      {answer ? (
        <div className="mt-3">
          <Markdown className="text-base">{answer.md}</Markdown>
          {answer.found ? <CitationStrip citations={answer.citations} support={answer.support} className="mt-3" /> : null}
        </div>
      ) : null}
    </Card>
  );
}
