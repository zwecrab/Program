"use client";

import { useState, useTransition } from "react";
import { Button, Field, Input, Select } from "@/components/ui";
import { enqueueGeneration, updateSettings } from "./actions";

export function AdminGenerateForm({ tasks }: { tasks: Array<{ id: number; title: string }> }) {
  const [task, setTask] = useState(tasks.find((t) => t.id === 23)?.id ?? tasks[0]?.id ?? 1);
  const [count, setCount] = useState(20);
  const [difficulty, setDifficulty] = useState<string>("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_5rem_7rem_auto] sm:items-end">
      <Field label="ECO task">
        <Select value={task} onChange={(e) => setTask(Number(e.target.value))}>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Count">
        <Input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </Field>
      <Field label="Difficulty">
        <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
          <option value="">mixed</option>
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="3">3</option>
        </Select>
      </Field>
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            await enqueueGeneration(task, count, difficulty ? (Number(difficulty) as 1 | 2 | 3) : null);
            setDone(true);
          })
        }
      >
        {done ? "Queued ✓" : "Queue run"}
      </Button>
    </div>
  );
}

export function AdminSettingsForm({ cap, locale }: { cap: number; locale: "en" | "my" }) {
  const [pending, start] = useTransition();
  return (
    <form
      action={(fd) => start(() => updateSettings(fd))}
      className="mt-2 grid gap-2 sm:grid-cols-[8rem_10rem_auto] sm:items-end"
    >
      <Field label="Monthly LLM cap (USD)">
        <Input name="monthly_llm_cap_usd" type="number" step="0.5" min={0.5} defaultValue={cap} />
      </Field>
      <Field label="Language">
        <Select name="locale" defaultValue={locale}>
          <option value="en">English</option>
          <option value="my">မြန်မာ</option>
        </Select>
      </Field>
      <Button type="submit" variant="secondary" disabled={pending}>
        Save
      </Button>
    </form>
  );
}
