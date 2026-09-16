"use client";

import { useActionState } from "react";
import { Button, Card, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { DISTRACTOR_FAMILIES } from "@/db/schema";
import { saveEditedQuestion, type EditResult } from "../../actions";

interface Q {
  id: number;
  stem: string;
  explanation_md: string;
  pmbok_ref: string;
  difficulty: number;
  item_type: string;
  exhibit_json: string;
  options: Array<{ body: string; is_correct: boolean; distractor_family: string; rationale: string }>;
}

export function QuestionEditor({ question }: { question: Q }) {
  const [state, action, pending] = useActionState<EditResult | null, FormData>(saveEditedQuestion, null);
  const optionBased = question.options.length > 0;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={question.id} />
      <input type="hidden" name="option_count" value={question.options.length} />
      <Card className="space-y-3 p-4">
        <Field label="Stem">
          <Textarea name="stem" defaultValue={question.stem} rows={5} className="prose-reading" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="PMBOK 8 reference">
            <Input name="pmbok_ref" defaultValue={question.pmbok_ref} />
          </Field>
          <Field label="Difficulty">
            <Select name="difficulty" defaultValue={String(question.difficulty)}>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </Select>
          </Field>
        </div>
        <Field label="Explanation (markdown)">
          <Textarea name="explanation_md" defaultValue={question.explanation_md} rows={4} />
        </Field>
      </Card>

      {optionBased ? (
        question.options.map((o, i) => (
          <Card key={i} className="space-y-2 p-4">
            <CardTitle>Option {String.fromCharCode(65 + i)}</CardTitle>
            <Textarea name={`opt_${i}_body`} defaultValue={o.body} rows={2} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`opt_${i}_correct`} defaultChecked={o.is_correct} /> Correct
              </label>
              <Select name={`opt_${i}_family`} defaultValue={o.distractor_family}>
                <option value="">— no family (correct option) —</option>
                {DISTRACTOR_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea name={`opt_${i}_rationale`} defaultValue={o.rationale} rows={2} />
          </Card>
        ))
      ) : (
        <Card className="p-4">
          <Field label={`Exhibit JSON (${question.item_type} answer key)`} hint="Validated against the per-type schema on save (DECISIONS #13).">
            <Textarea name="exhibit_json" defaultValue={question.exhibit_json} rows={14} className="font-mono text-xs" />
          </Field>
        </Card>
      )}

      {state?.errors?.length ? (
        <Card className="border-incorrect p-3 text-sm text-incorrect">
          <ul className="list-disc pl-5">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {state?.ok ? (
        <Card className={`p-3 text-sm ${state.problems?.length ? "border-warn" : "border-correct"}`}>
          Saved.{" "}
          {state.problems?.length ? `Deterministic QA still flags: ${state.problems.join("; ")}` : "Deterministic QA passes. Approve above to put it in the bank."}
        </Card>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save edits"}
      </Button>
    </form>
  );
}
