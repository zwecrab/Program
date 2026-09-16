"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { Markdown } from "@/components/markdown";
import { CitationStrip } from "@/components/citations";
import { cn } from "@/lib/utils";
import type { Citation } from "@/lib/retrieval";
import type { SupportLevel } from "@/db/schema";
import { setLessonReviewed } from "@/app/actions";

interface Section {
  key: string;
  title: string;
  md: string;
  support?: { support: SupportLevel; citations: Citation[] };
  pair?: string;
}

/** Collapsible lesson sections; predictive/adaptive render side by side on wide screens (build prompt §5.3). */
export function LessonSections({ sections, lessonId, reviewed }: { sections: Section[]; lessonId: number; reviewed: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>(Object.fromEntries(sections.map((s) => [s.key, true])));
  const [pending, start] = useTransition();
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const rendered = new Set<string>();
  const blocks: React.ReactNode[] = [];
  for (const s of sections) {
    if (rendered.has(s.key) || !s.md) continue;
    const partner = s.pair ? sections.find((x) => x.key === s.pair) : undefined;
    if (partner && partner.md) {
      rendered.add(partner.key);
      blocks.push(
        <div key={s.key} className="grid gap-3 lg:grid-cols-2">
          <SectionCard s={s} open={open[s.key]} onToggle={() => toggle(s.key)} />
          <SectionCard s={partner} open={open[partner.key]} onToggle={() => toggle(partner.key)} />
        </div>,
      );
    } else {
      blocks.push(<SectionCard key={s.key} s={s} open={open[s.key]} onToggle={() => toggle(s.key)} />);
    }
    rendered.add(s.key);
  }

  return (
    <div className="space-y-3">
      {blocks}
      <div className="flex justify-end">
        <Button variant={reviewed ? "secondary" : "soft"} size="sm" disabled={pending} onClick={() => start(() => setLessonReviewed(lessonId, !reviewed))}>
          {reviewed ? "Mark unreviewed" : "I've read and checked this lesson"}
        </Button>
      </div>
    </div>
  );
}

function SectionCard({ s, open, onToggle }: { s: Section; open: boolean; onToggle: () => void }) {
  return (
    <Card className="p-4">
      <button onClick={onToggle} className="flex w-full items-center justify-between gap-2 text-left" aria-expanded={open}>
        <h2 className="text-xl">{s.title}</h2>
        <ChevronDown size={18} className={cn("shrink-0 text-fg-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="mt-3">
          <Markdown>{s.md}</Markdown>
          {s.support ? <CitationStrip citations={s.support.citations} support={s.support.support} className="mt-4" /> : null}
        </div>
      ) : null}
    </Card>
  );
}
