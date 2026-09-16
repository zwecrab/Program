"use client";

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Badge, Dialog, DialogContent } from "@/components/ui";
import type { Citation } from "@/lib/retrieval";
import type { SupportLevel } from "@/db/schema";
import { cn } from "@/lib/utils";

export const SUPPORT_LABELS: Record<SupportLevel, string> = { high: "Well sourced", medium: "Partly sourced", low: "Unsourced" };

export function SupportBadge({ support, className }: { support: SupportLevel | null | undefined; className?: string }) {
  if (!support) return null;
  const tone = support === "high" ? "correct" : support === "medium" ? "warn" : "incorrect";
  return (
    <Badge tone={tone} className={className}>
      {SUPPORT_LABELS[support]}
    </Badge>
  );
}

/**
 * Footnote strip (Phase 2 brief §17.4): one chip per citation; clicking opens
 * the chunk text fetched from /api/chunks/[id].
 */
export function CitationStrip({ citations, support, className }: { citations: Citation[]; support?: SupportLevel | null; className?: string }) {
  const [open, setOpen] = useState<Citation | null>(null);
  const [text, setText] = useState<string>("");
  if (!citations?.length && !support) return null;

  async function show(c: Citation) {
    setOpen(c);
    setText("Loading…");
    const res = await fetch(`/api/chunks/${c.chunk_id}`);
    const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    setText(j.text ?? j.error ?? "Chunk not found.");
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-xs", className)}>
      <SupportBadge support={support} />
      {citations.map((c, i) => (
        <button
          key={`${c.chunk_id}-${i}`}
          onClick={() => show(c)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-fg-muted hover:border-border-strong hover:text-fg"
          title={`${c.source_book} — ${c.source_section}`}
        >
          <BookOpen size={12} aria-hidden />
          <span className="max-w-[16rem] truncate">{c.source_section.split(" › ").pop()}</span>
          <span className="tabular">{c.printed_page ? `p.${c.printed_page}` : c.pdf_page ? `PDF ${c.pdf_page}` : ""}</span>
        </button>
      ))}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open ? (
          <DialogContent title={open.source_section.split(" › ").pop() ?? "Source"}>
            <p className="mb-2 text-xs text-fg-muted">
              {open.source_book}
              {open.printed_page ? ` · printed p. ${open.printed_page}` : ""}
              {open.pdf_page ? ` · PDF p. ${open.pdf_page}` : ""}
            </p>
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-md bg-bg-sunken p-3 text-sm leading-relaxed">{text}</div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}
