"use client";

import { useActionState, useState } from "react";
import { Button, Card, CardTitle, Field, Input, Select, Textarea } from "@/components/ui";
import { DELIVERY_APPROACHES, DISTRACTOR_FAMILIES, ITEM_TYPES, STYLES, type Domain } from "@/db/schema";
import { saveManualQuestion, type SaveResult } from "../actions";

interface TaskOpt {
  id: number;
  title: string;
  domain: Domain;
}

export function QuestionForm({ tasks }: { tasks: TaskOpt[] }) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(saveManualQuestion, null);
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? 1);
  const domain = tasks.find((t) => t.id === taskId)?.domain ?? "process";

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="domain" value={domain} />
      <Card className="grid gap-3 sm:grid-cols-2">
        <Field label="ECO task">
          <Select name="eco_task_id" value={taskId} onChange={(e) => setTaskId(Number(e.target.value))}>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Domain (from task)">
          <Input value={domain} readOnly />
        </Field>
        <Field label="Delivery approach">
          <Select name="delivery_approach" defaultValue="hybrid">
            {DELIVERY_APPROACHES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Item type">
          <Select name="item_type" defaultValue="single">
            {ITEM_TYPES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
        <Field label="Difficulty">
          <Select name="difficulty" defaultValue="2">
            <option value="1">1 — recall</option>
            <option value="2">2 — application</option>
            <option value="3">3 — judgement under ambiguity</option>
          </Select>
        </Field>
        <Field label="Style">
          <Select name="style" defaultValue="what_should_pm_do">
            {STYLES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="space-y-3">
        <Field label="Stem" hint="Use may/might/could for risks, will/has/is for issues — deliberately.">
          <Textarea name="stem" rows={5} required minLength={20} />
        </Field>
        <Field label="PMBOK 8 reference" hint="e.g. Guide §2.7 Perform Risk Analysis">
          <Input name="pmbok_ref" />
        </Field>
        <Field label="Explanation (markdown)">
          <Textarea name="explanation_md" rows={3} />
        </Field>
      </Card>

      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="space-y-2">
          <CardTitle>Option {String.fromCharCode(65 + i)}</CardTitle>
          <Textarea name={`opt_${i}_body`} rows={2} placeholder="Option text" />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`opt_${i}_correct`} /> Correct answer
            </label>
            <Select name={`opt_${i}_family`} defaultValue="">
              <option value="">— distractor family (wrong options only) —</option>
              {DISTRACTOR_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
          </div>
          <Textarea name={`opt_${i}_rationale`} rows={2} placeholder="Why this option is right or wrong" />
        </Card>
      ))}

      {state?.errors?.length ? (
        <Card className="border-danger">
          <ul className="list-disc pl-5 text-sm text-danger">
            {state.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      {state?.ok ? (
        <Card className="border-success text-sm">
          Saved as question #{state.id}. Add another below or return to <a className="underline" href="/admin">Admin</a>.
        </Card>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save question"}
      </Button>
    </form>
  );
}
