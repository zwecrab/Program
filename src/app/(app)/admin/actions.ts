"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { generationRuns, questions } from "@/db/schema";
import { getExamId } from "@/db/queries";
import { isAuthenticated } from "@/lib/session";
import { questionInputSchema } from "@/lib/question-schema";
import { deterministicChecks, loadBankStems, loadQuestionInput, loadSourceTexts, replaceQuestion, type QaRecord } from "@/lib/generation/qa";
import { setSetting } from "@/lib/settings";

async function guard() {
  if (!(await isAuthenticated())) throw new Error("unauthenticated");
}

export async function setQuestionStatus(id: number, status: "active" | "quarantined" | "retired") {
  await guard();
  const [q] = await db.select({ qaJson: questions.qaJson }).from(questions).where(eq(questions.id, id)).limit(1);
  const record = (q?.qaJson ? JSON.parse(q.qaJson) : {}) as Partial<QaRecord> & { manual?: string };
  record.manual = `${status} by hand at ${new Date().toISOString()}`;
  await db.update(questions).set({ status, qaJson: JSON.stringify(record) }).where(eq(questions.id, id));
  revalidatePath("/admin/queue");
  revalidatePath("/admin");
}

export interface EditResult {
  ok: boolean;
  errors?: string[];
  problems?: string[];
}

/** Save a hand-edited question from the queue editor; re-runs the deterministic checks. */
export async function saveEditedQuestion(_prev: EditResult | null, formData: FormData): Promise<EditResult> {
  await guard();
  const id = Number(formData.get("id"));
  const current = await loadQuestionInput(id);
  if (!current) return { ok: false, errors: ["question not found"] };

  const optionCount = Number(formData.get("option_count") ?? 0);
  const options = Array.from({ length: optionCount }, (_, i) => ({
    label: String.fromCharCode(65 + i),
    body: String(formData.get(`opt_${i}_body`) ?? "").trim(),
    is_correct: formData.get(`opt_${i}_correct`) === "on",
    distractor_family: (String(formData.get(`opt_${i}_family`) ?? "") || null) as never,
    rationale: String(formData.get(`opt_${i}_rationale`) ?? "").trim(),
  })).filter((o) => o.body);

  let exhibit: unknown = current.exhibit ?? null;
  const exhibitRaw = String(formData.get("exhibit_json") ?? "").trim();
  if (exhibitRaw) {
    try {
      exhibit = JSON.parse(exhibitRaw);
    } catch {
      return { ok: false, errors: ["exhibit_json is not valid JSON"] };
    }
  }

  const parsed = questionInputSchema.safeParse({
    ...current,
    stem: String(formData.get("stem") ?? ""),
    explanation_md: String(formData.get("explanation_md") ?? ""),
    pmbok_ref: String(formData.get("pmbok_ref") ?? "") || null,
    difficulty: Number(formData.get("difficulty") ?? current.difficulty),
    options: optionCount ? options : current.options,
    exhibit,
  });
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "question"}: ${i.message}`) };

  await replaceQuestion(id, parsed.data);
  const det = deterministicChecks(parsed.data, { bankStems: await loadBankStems(parsed.data.syllabus_item_id, id), sourceTexts: await loadSourceTexts() });
  const [row] = await db.select({ qaJson: questions.qaJson }).from(questions).where(eq(questions.id, id)).limit(1);
  const record = (row?.qaJson ? JSON.parse(row.qaJson) : {}) as Partial<QaRecord>;
  record.deterministic = det;
  record.revised = true;
  await db.update(questions).set({ qaJson: JSON.stringify(record) }).where(eq(questions.id, id));
  revalidatePath(`/admin/queue/${id}`);
  revalidatePath("/admin/queue");
  return { ok: true, problems: det.problems };
}

/** Queue a generation run; `npm run jobs` performs it on your machine. */
export async function enqueueGeneration(syllabusItemId: number, count: number, difficulty: 1 | 2 | 3 | null) {
  await guard();
  const examId = await getExamId();
  const [existing] = await db
    .select({ id: generationRuns.id })
    .from(generationRuns)
    .where(and(eq(generationRuns.syllabusItemId, syllabusItemId), inArray(generationRuns.status, ["queued"]), eq(generationRuns.kind, "questions")))
    .limit(1);
  if (existing) return;
  await db.insert(generationRuns).values({ examId, kind: "questions", syllabusItemId, status: "queued", requested: count, paramsJson: JSON.stringify({ count, difficulty }) });
  revalidatePath("/admin");
  revalidatePath("/admin/runs");
}

export async function updateSettings(formData: FormData) {
  await guard();
  const cap = Number(formData.get("monthly_llm_cap_usd"));
  if (Number.isFinite(cap) && cap > 0) await setSetting("monthly_llm_cap_usd", String(cap));
  const locale = String(formData.get("locale"));
  if (locale === "en" || locale === "my") await setSetting("locale", locale);
  revalidatePath("/", "layout");
}
