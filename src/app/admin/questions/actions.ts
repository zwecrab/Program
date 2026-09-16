"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { options, questions } from "@/db/schema";
import { questionInputSchema, type QuestionInput } from "@/lib/question-schema";
import { isAuthenticated } from "@/lib/session";

export interface SaveResult {
  ok: boolean;
  id?: number;
  errors?: string[];
}

/** Insert a validated question and its options. Shared by manual entry now and the generator later. */
export async function insertQuestion(input: QuestionInput, sourceBatch: string, status: "active" | "qa_pending" = "active") {
  const [q] = await db
    .insert(questions)
    .values({
      ecoTaskId: input.eco_task_id,
      domain: input.domain,
      deliveryApproach: input.delivery_approach,
      itemType: input.item_type,
      difficulty: input.difficulty,
      style: input.style,
      stem: input.stem,
      exhibitJson: input.exhibit ? JSON.stringify(input.exhibit) : null,
      explanationMd: input.explanation_md ?? "",
      pmbokRef: input.pmbok_ref ?? null,
      sourceBatch,
      status,
    })
    .returning({ id: questions.id });
  if (input.options.length === 0) return q.id; // exhibit-keyed item types carry their key in exhibit_json
  await db.insert(options).values(
    input.options.map((o) => ({
      questionId: q.id,
      label: o.label.toUpperCase(),
      body: o.body,
      isCorrect: o.is_correct,
      distractorFamily: o.distractor_family ?? null,
      rationale: o.rationale,
    })),
  );
  return q.id;
}

/** Server action behind the manual entry form. */
export async function saveManualQuestion(_prev: SaveResult | null, formData: FormData): Promise<SaveResult> {
  if (!(await isAuthenticated())) return { ok: false, errors: ["Not signed in."] };

  const optionCount = 4;
  const opts = Array.from({ length: optionCount }, (_, i) => {
    const body = String(formData.get(`opt_${i}_body`) ?? "").trim();
    const fam = String(formData.get(`opt_${i}_family`) ?? "");
    return {
      label: String.fromCharCode(65 + i),
      body,
      is_correct: formData.get(`opt_${i}_correct`) === "on",
      distractor_family: fam ? (fam as QuestionInput["options"][number]["distractor_family"]) : null,
      rationale: String(formData.get(`opt_${i}_rationale`) ?? "").trim(),
    };
  }).filter((o) => o.body.length > 0);

  const raw = {
    eco_task_id: Number(formData.get("eco_task_id")),
    domain: String(formData.get("domain")),
    delivery_approach: String(formData.get("delivery_approach")),
    item_type: String(formData.get("item_type")),
    difficulty: Number(formData.get("difficulty")),
    style: String(formData.get("style")),
    stem: String(formData.get("stem") ?? ""),
    explanation_md: String(formData.get("explanation_md") ?? ""),
    pmbok_ref: String(formData.get("pmbok_ref") ?? "") || null,
    options: opts,
  };

  const parsed = questionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "question"}: ${i.message}`) };
  }
  const id = await insertQuestion(parsed.data, "manual");
  revalidatePath("/admin");
  return { ok: true, id };
}
