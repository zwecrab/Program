"use client";

/**
 * Renders one question of any of the eight item types and collects an answer
 * in the shape scoring.ts expects. Presentational: the parent decides what
 * happens on submit (practice review vs exam next).
 */
import { useMemo, useState } from "react";
import { Button, Card } from "@/components/ui";
import { ExhibitView } from "@/components/exhibit";
import { cn } from "@/lib/utils";
import type { Exhibit } from "@/lib/question-schema";
import type { Chosen } from "@/lib/scoring";

export interface PlayerQuestion {
  id: number;
  itemType: string;
  stem: string;
  exhibit: Exhibit | null;
  options: Array<{ id: number; label: string; body: string }>;
  taskCode: string;
  taskTitle: string;
  difficulty: number;
  deliveryApproach: string;
}

export interface PlayerProps {
  q: PlayerQuestion;
  index: number;
  total: number;
  onSubmit: (chosen: Chosen) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  /** Exam mode hides task metadata so nothing leaks the domain. */
  hideMeta?: boolean;
  /** Pre-fill (exam navigation back to an answered question). */
  initial?: Chosen;
  disabled?: boolean;
}

export function QuestionPlayer({ q, index, total, onSubmit, submitting, submitLabel = "Submit", hideMeta, initial, disabled }: PlayerProps) {
  const [picked, setPicked] = useState<number[]>(Array.isArray(initial) ? initial : []);
  const [map, setMap] = useState<Record<string, string>>(initial && typeof initial === "object" && !Array.isArray(initial) ? initial : {});
  const [region, setRegion] = useState<string | null>(typeof initial === "string" ? initial : null);

  const optionBased = ["single", "multi", "graphic", "case"].includes(q.itemType);
  const multi = q.itemType === "multi";
  const ex = q.exhibit;

  const chosen: Chosen = useMemo(() => {
    if (optionBased) return picked;
    if (ex?.kind === "point_and_click") return region;
    return map;
  }, [optionBased, picked, ex, region, map]);

  const ready = useMemo(() => {
    if (optionBased) return multi ? picked.length >= 2 : picked.length === 1;
    if (!ex) return false;
    if (ex.kind === "matching" || ex.kind === "enhanced_matching") return ex.left.every((l) => map[l.id]);
    if (ex.kind === "point_and_click") return !!region;
    if (ex.kind === "pull_down_list") return ex.blanks.every((b) => map[b.id]);
    return false;
  }, [optionBased, multi, picked, ex, map, region]);

  const toggle = (id: number) => {
    if (disabled) return;
    setPicked((p) => (multi ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-fg-muted">
        <span className="tabular">
          Question {index + 1} of {total}
        </span>
        {!hideMeta ? (
          <span className="truncate">
            {q.taskCode} · {q.taskTitle} · d{q.difficulty} · {q.deliveryApproach}
          </span>
        ) : (
          <span>{q.itemType === "multi" ? "multiple response" : q.itemType.replace(/_/g, " ")}</span>
        )}
      </div>

      {ex && q.itemType === "graphic" && "data" in ex ? <ExhibitView kind={ex.kind} title={ex.title} data={ex.data} /> : null}

      <p className="prose-reading text-lg">{q.stem}</p>

      {optionBased ? (
        <ul className="space-y-2" role={multi ? "group" : "radiogroup"}>
          {q.options.map((o) => {
            const on = picked.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role={multi ? "checkbox" : "radio"}
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => toggle(o.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left text-base leading-relaxed transition-colors",
                    on ? "border-accent bg-accent-soft/60" : "border-border bg-surface hover:border-border-strong",
                  )}
                >
                  <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold", on ? "border-accent bg-accent text-accent-fg" : "border-border-strong text-fg-muted")}>
                    {o.label}
                  </span>
                  <span className="prose-reading">{o.body}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {ex && (ex.kind === "matching" || ex.kind === "enhanced_matching") ? (
        <Card className="divide-y divide-border">
          {ex.left.map((l) => (
            <div key={l.id} className="grid gap-2 p-3 sm:grid-cols-2 sm:items-center">
              <span className="text-base">{l.text}</span>
              <select
                value={map[l.id] ?? ""}
                disabled={disabled}
                onChange={(e) => setMap((m) => ({ ...m, [l.id]: e.target.value }))}
                className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
              >
                <option value="">— choose —</option>
                {ex.right.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {ex.kind === "enhanced_matching" ? <p className="p-3 text-xs text-fg-muted">Some entries on the right match nothing.</p> : null}
        </Card>
      ) : null}

      {ex && ex.kind === "point_and_click" ? (
        <div className="relative">
          {"data" in ex.base ? <ExhibitView kind={ex.base.kind} title={ex.base.title} data={ex.base.data} /> : <Card className="p-4 text-sm text-fg-muted">{ex.base.description}</Card>}
          <div className="absolute inset-0">
            {ex.regions.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={region === r.id}
                disabled={disabled}
                onClick={() => setRegion(r.id)}
                title={r.label}
                className={cn("absolute rounded-md border-2 text-[10px] font-medium transition-colors", region === r.id ? "border-accent bg-accent/25" : "border-transparent hover:border-accent/60 hover:bg-accent/10")}
                style={{ left: `${r.rect.x * 100}%`, top: `${r.rect.y * 100}%`, width: `${r.rect.w * 100}%`, height: `${r.rect.h * 100}%` }}
              >
                <span className="sr-only">{r.label}</span>
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-fg-muted">Click a region of the exhibit.{region ? ` Selected: ${ex.regions.find((r) => r.id === region)?.label}` : ""}</p>
        </div>
      ) : null}

      {ex && ex.kind === "pull_down_list" ? (
        <Card className="p-4">
          <p className="prose-reading text-base leading-loose">
            {ex.template.split(/(\{\{[^}]+\}\})/).map((part, i) => {
              const m = part.match(/^\{\{([^}]+)\}\}$/);
              if (!m) return <span key={i}>{part}</span>;
              const blank = ex.blanks.find((b) => b.id === m[1]);
              if (!blank) return <span key={i}>{part}</span>;
              return (
                <select
                  key={i}
                  value={map[blank.id] ?? ""}
                  disabled={disabled}
                  onChange={(e) => setMap((mm) => ({ ...mm, [blank.id]: e.target.value }))}
                  className="mx-1 inline-block h-8 rounded-md border border-accent/50 bg-accent-soft/40 px-2 text-sm align-baseline"
                >
                  <option value="">…</option>
                  {blank.choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.text}
                    </option>
                  ))}
                </select>
              );
            })}
          </p>
        </Card>
      ) : null}

      {!disabled ? (
        <div className="flex justify-end">
          <Button size="lg" disabled={!ready || submitting} onClick={() => onSubmit(chosen)}>
            {submitting ? "…" : submitLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
