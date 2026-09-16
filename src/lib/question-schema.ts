import { z } from "zod";
import { DELIVERY_APPROACHES, DISTRACTOR_FAMILIES, DOMAINS, ITEM_TYPES, STYLES } from "@/db/schema";

/**
 * One schema for every question that enters the bank — manual entry now,
 * LLM output in Phase 2. Structural rules from build prompt §6.3 / §7 that
 * can be checked without the rest of the bank live here.
 */
export const optionSchema = z.object({
  label: z.string().trim().min(1).max(4),
  body: z.string().trim().min(1).max(600),
  is_correct: z.boolean(),
  distractor_family: z.enum(DISTRACTOR_FAMILIES).nullable(),
  rationale: z.string().trim().min(1).max(1200),
});

export const questionInputSchema = z
  .object({
    eco_task_id: z.number().int().min(1).max(26),
    domain: z.enum(DOMAINS),
    delivery_approach: z.enum(DELIVERY_APPROACHES),
    item_type: z.enum(ITEM_TYPES),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    style: z.enum(STYLES),
    stem: z.string().trim().min(20).max(3000),
    exhibit: z.unknown().optional().nullable(),
    explanation_md: z.string().trim().default(""),
    pmbok_ref: z.string().trim().max(200).optional().nullable(),
    options: z.array(optionSchema).min(2).max(8),
  })
  .superRefine((q, ctx) => {
    const correct = q.options.filter((o) => o.is_correct).length;
    if (q.item_type === "single" && correct !== 1) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "single-answer items need exactly one correct option" });
    }
    if (q.item_type === "multi" && (correct < 2 || correct > 3)) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "multi-answer items need 2–3 correct options" });
    }
    if (correct === 0) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "at least one option must be correct" });
    }
    q.options.forEach((o, i) => {
      if (!o.is_correct && !o.distractor_family) {
        ctx.addIssue({ code: "custom", path: ["options", i, "distractor_family"], message: "every wrong option needs a distractor family" });
      }
      if (o.is_correct && o.distractor_family) {
        ctx.addIssue({ code: "custom", path: ["options", i, "distractor_family"], message: "the correct option must not carry a distractor family" });
      }
    });
    const labels = new Set(q.options.map((o) => o.label.toUpperCase()));
    if (labels.size !== q.options.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "option labels must be unique" });
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;
export type OptionInput = z.infer<typeof optionSchema>;

/** Words PMI rarely puts in a correct answer. Deterministic QA uses this list. */
export const ABSOLUTE_WORDS = ["always", "never", "all", "none", "every", "only", "must never"];

export function containsAbsolute(text: string): boolean {
  const lower = ` ${text.toLowerCase().replace(/[^a-z\s]/g, " ")} `;
  return ABSOLUTE_WORDS.some((w) => lower.includes(` ${w} `));
}
