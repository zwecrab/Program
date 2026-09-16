import { z } from "zod";
import {
  DELIVERY_APPROACHES,
  DISTRACTOR_FAMILIES,
  DOMAINS,
  ITEM_TYPES,
  OPTION_BASED_ITEM_TYPES,
  STYLES,
  type ItemType,
} from "@/db/schema";

/**
 * One schema for every question that enters the bank — manual entry now,
 * LLM output in Phase 2. This file is the single definition of the ANSWER
 * SHAPE per item type (DECISIONS.md #13):
 *
 *   single · multi · graphic · case   → answer key in `options[]`
 *   matching · enhanced_matching
 *   point_and_click · pull_down_list  → answer key in `exhibit` (stored as exhibit_json)
 *
 * Whatever the type, every wrong choice carries a `distractor_family` and a
 * `rationale`, and every correct choice carries a `rationale` and no family.
 */

const family = z.enum(DISTRACTOR_FAMILIES);

/** A selectable thing that is right or wrong. Shared by options and every exhibit choice. */
const choiceFields = {
  is_correct: z.boolean(),
  distractor_family: family.nullable().optional(),
  rationale: z.string().trim().min(1).max(1200),
};

export const optionSchema = z.object({
  label: z.string().trim().min(1).max(4),
  body: z.string().trim().min(1).max(600),
  ...choiceFields,
});

// ---------------------------------------------------------------------------
// Exhibit shapes
// ---------------------------------------------------------------------------

/** Chart specs the app renders with Recharts (build prompt §6.6). Data shape is per kind; validated loosely here. */
export const GRAPHIC_KINDS = [
  "burndown",
  "burnup",
  "network_diagram",
  "control_chart",
  "pareto",
  "tornado",
  "evm_dashboard",
  "histogram",
  "kanban",
  "power_interest_grid",
] as const;

export const graphicExhibitSchema = z.object({
  kind: z.enum(GRAPHIC_KINDS),
  title: z.string().trim().max(200).optional(),
  data: z.unknown(),
});

const id = z.string().trim().min(1).max(40);

/** matching / enhanced_matching: each left item maps to exactly one right item. */
export const matchingExhibitSchema = z.object({
  kind: z.enum(["matching", "enhanced_matching"]),
  left: z.array(z.object({ id, text: z.string().trim().min(1).max(400) })).min(2).max(8),
  right: z
    .array(
      z.object({
        id,
        text: z.string().trim().min(1).max(400),
        /** Only meaningful for right items that match nothing (enhanced_matching distractors). */
        distractor_family: family.nullable().optional(),
        rationale: z.string().trim().max(1200).optional(),
      }),
    )
    .min(2)
    .max(12),
  /** The key: one pair per left item. */
  answer: z.array(z.object({ left: id, right: id })).min(2),
  /** Why each pairing is right (shown on review). Keyed by left id. */
  rationales: z.record(z.string(), z.string().trim().min(1).max(1200)),
});

/** point_and_click: regions over an exhibit; the learner clicks one. */
export const pointAndClickExhibitSchema = z.object({
  kind: z.literal("point_and_click"),
  /** What is drawn: a graphic spec (rendered) or a labelled diagram description. */
  base: z.union([graphicExhibitSchema, z.object({ kind: z.literal("diagram"), description: z.string().trim().min(1).max(2000) })]),
  regions: z
    .array(
      z.object({
        id,
        label: z.string().trim().min(1).max(200),
        /** Normalised 0–1 rectangle over the rendered exhibit. */
        rect: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) }),
        ...choiceFields,
      }),
    )
    .min(2)
    .max(10),
});

/** pull_down_list: a sentence with {{blank_id}} placeholders, each a dropdown. */
export const pullDownListExhibitSchema = z.object({
  kind: z.literal("pull_down_list"),
  template: z.string().trim().min(10).max(2000),
  blanks: z
    .array(
      z.object({
        id,
        choices: z.array(z.object({ id, text: z.string().trim().min(1).max(300), ...choiceFields })).min(2).max(6),
      }),
    )
    .min(1)
    .max(5),
});

export const exhibitSchema = z.union([graphicExhibitSchema, matchingExhibitSchema, pointAndClickExhibitSchema, pullDownListExhibitSchema]);
export type Exhibit = z.infer<typeof exhibitSchema>;

// ---------------------------------------------------------------------------
// Question
// ---------------------------------------------------------------------------

export const questionInputSchema = z
  .object({
    eco_task_id: z.number().int().min(1).max(26),
    domain: z.enum(DOMAINS),
    delivery_approach: z.enum(DELIVERY_APPROACHES),
    item_type: z.enum(ITEM_TYPES),
    difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    style: z.enum(STYLES),
    stem: z.string().trim().min(20).max(3000),
    exhibit: exhibitSchema.optional().nullable(),
    explanation_md: z.string().trim().default(""),
    pmbok_ref: z.string().trim().max(200).optional().nullable(),
    options: z.array(optionSchema).max(8).default([]),
  })
  .superRefine((q, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });

    /** Every choice, wherever it lives: wrong ⇒ family required; right ⇒ family forbidden. */
    const checkChoice = (c: { is_correct: boolean; distractor_family?: string | null }, path: (string | number)[]) => {
      if (!c.is_correct && !c.distractor_family) issue([...path, "distractor_family"], "every wrong choice needs a distractor family");
      if (c.is_correct && c.distractor_family) issue([...path, "distractor_family"], "a correct choice must not carry a distractor family");
    };

    const optionBased = (OPTION_BASED_ITEM_TYPES as readonly ItemType[]).includes(q.item_type);

    if (optionBased) {
      if (q.options.length < 2) issue(["options"], `${q.item_type} items need at least 2 options`);
      const correct = q.options.filter((o) => o.is_correct).length;
      if (q.item_type === "multi") {
        if (correct < 2 || correct > 3) issue(["options"], "multi-response items need 2–3 correct options");
      } else if (correct !== 1) {
        issue(["options"], `${q.item_type} items need exactly one correct option`);
      }
      q.options.forEach((o, i) => checkChoice(o, ["options", i]));
      if (new Set(q.options.map((o) => o.label.toUpperCase())).size !== q.options.length) issue(["options"], "option labels must be unique");
      if (q.item_type === "graphic" && q.exhibit?.kind && !(GRAPHIC_KINDS as readonly string[]).includes(q.exhibit.kind)) {
        issue(["exhibit", "kind"], "graphic items need a chart exhibit");
      }
      if (q.item_type === "graphic" && !q.exhibit) issue(["exhibit"], "graphic items need an exhibit");
      return;
    }

    // Exhibit-keyed types: options must be empty, exhibit kind must match the item type.
    if (q.options.length) issue(["options"], `${q.item_type} items keep their answer in exhibit, not options`);
    if (!q.exhibit) return issue(["exhibit"], `${q.item_type} items need an exhibit carrying the answer key`);
    if (!q.explanation_md) issue(["explanation_md"], `${q.item_type} items need an explanation`);
    const ex = q.exhibit;

    if (q.item_type === "matching" || q.item_type === "enhanced_matching") {
      if (ex.kind !== q.item_type) return issue(["exhibit", "kind"], `exhibit.kind must be "${q.item_type}"`);
      const leftIds = new Set(ex.left.map((l) => l.id));
      const rightIds = new Set(ex.right.map((r) => r.id));
      if (leftIds.size !== ex.left.length || rightIds.size !== ex.right.length) issue(["exhibit"], "matching ids must be unique");
      const answeredLeft = new Set(ex.answer.map((a) => a.left));
      const usedRight = new Set(ex.answer.map((a) => a.right));
      if (answeredLeft.size !== ex.answer.length || usedRight.size !== ex.answer.length) issue(["exhibit", "answer"], "each left and right id may appear once in the key");
      for (const l of leftIds) if (!answeredLeft.has(l)) issue(["exhibit", "answer"], `left "${l}" has no match in the key`);
      for (const a of ex.answer) {
        if (!leftIds.has(a.left) || !rightIds.has(a.right)) issue(["exhibit", "answer"], `key refers to unknown id ${a.left}→${a.right}`);
        if (!ex.rationales[a.left]) issue(["exhibit", "rationales", a.left], "every pairing needs a rationale");
      }
      const unused = ex.right.filter((r) => !usedRight.has(r.id));
      if (q.item_type === "matching" && unused.length) issue(["exhibit", "right"], "plain matching uses every right item; use enhanced_matching for extras");
      if (q.item_type === "enhanced_matching" && unused.length === 0) issue(["exhibit", "right"], "enhanced_matching needs at least one right item that matches nothing");
      unused.forEach((r) => {
        const i = ex.right.findIndex((x) => x.id === r.id);
        if (!r.distractor_family) issue(["exhibit", "right", i, "distractor_family"], "an unmatched right item is a distractor and needs a family");
        if (!r.rationale) issue(["exhibit", "right", i, "rationale"], "an unmatched right item needs a rationale");
      });
      return;
    }

    if (q.item_type === "point_and_click") {
      if (ex.kind !== "point_and_click") return issue(["exhibit", "kind"], 'exhibit.kind must be "point_and_click"');
      if (ex.regions.filter((r) => r.is_correct).length !== 1) issue(["exhibit", "regions"], "point_and_click needs exactly one correct region");
      ex.regions.forEach((r, i) => {
        checkChoice(r, ["exhibit", "regions", i]);
        if (r.rect.x + r.rect.w > 1 || r.rect.y + r.rect.h > 1) issue(["exhibit", "regions", i, "rect"], "region must stay inside the exhibit");
      });
      return;
    }

    if (q.item_type === "pull_down_list") {
      if (ex.kind !== "pull_down_list") return issue(["exhibit", "kind"], 'exhibit.kind must be "pull_down_list"');
      ex.blanks.forEach((b, i) => {
        if (!ex.template.includes(`{{${b.id}}}`)) issue(["exhibit", "template"], `template is missing {{${b.id}}}`);
        if (b.choices.filter((c) => c.is_correct).length !== 1) issue(["exhibit", "blanks", i, "choices"], "each blank needs exactly one correct choice");
        b.choices.forEach((c, j) => checkChoice(c, ["exhibit", "blanks", i, "choices", j]));
      });
      const placeholders = [...ex.template.matchAll(/\{\{([^}]+)\}\}/g)].map((m) => m[1]);
      for (const p of placeholders) if (!ex.blanks.some((b) => b.id === p)) issue(["exhibit", "blanks"], `template placeholder {{${p}}} has no blank`);
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
