import { describe, expect, it } from "vitest";
import { ITEM_TYPES } from "@/db/schema";
import { questionInputSchema } from "@/lib/question-schema";

const common = {
  syllabus_item_id: 23,
  domain: "business_environment",
  delivery_approach: "hybrid",
  difficulty: 2,
  style: "concept",
  stem: "A stem that is comfortably longer than twenty characters for validation.",
  explanation_md: "Explanation.",
  pmbok_ref: "Guide §2.7",
} as const;

const ok = (o: Record<string, unknown>) => questionInputSchema.safeParse(o);
const errs = (o: Record<string, unknown>) => ok(o).error?.issues.map((i) => i.message) ?? [];

const right = { is_correct: true, distractor_family: null, rationale: "right" };
const wrong = (f = "wait_or_defer") => ({ is_correct: false, distractor_family: f, rationale: "wrong" });

describe("item types", () => {
  it("has exactly the eight 2026 PMP item types", () => {
    expect([...ITEM_TYPES].sort()).toEqual(
      ["case", "enhanced_matching", "graphic", "matching", "multi", "point_and_click", "pull_down_list", "single"].sort(),
    );
    expect(ITEM_TYPES).not.toContain("ordering");
    expect(ITEM_TYPES).not.toContain("calculation");
  });

  const mcq = [
    { label: "A", body: "A", ...right },
    { label: "B", body: "B", ...wrong("escalate_prematurely") },
    { label: "C", body: "C", ...wrong() },
    { label: "D", body: "D", ...wrong("act_without_analysis") },
  ];

  it("single / case need exactly one correct option", () => {
    expect(ok({ ...common, item_type: "single", options: mcq }).success).toBe(true);
    expect(ok({ ...common, item_type: "case", options: mcq }).success).toBe(true);
    expect(errs({ ...common, item_type: "single", options: mcq.map((o) => ({ ...o, ...wrong() })) })).toContain(
      "single items need exactly one correct option",
    );
  });

  it("multi needs 2–3 correct", () => {
    const two = mcq.map((o, i) => (i < 2 ? { label: o.label, body: o.body, ...right } : o));
    expect(ok({ ...common, item_type: "multi", options: two }).success).toBe(true);
    expect(ok({ ...common, item_type: "multi", options: mcq }).success).toBe(false);
  });

  it("graphic needs a chart exhibit plus options", () => {
    expect(ok({ ...common, item_type: "graphic", options: mcq }).success).toBe(false);
    expect(ok({ ...common, item_type: "graphic", options: mcq, exhibit: { kind: "burndown", data: [] } }).success).toBe(true);
  });

  const matchingExhibit = {
    kind: "matching",
    left: [
      { id: "l1", text: "Contingency reserve" },
      { id: "l2", text: "Management reserve" },
    ],
    right: [
      { id: "r1", text: "Identified risks" },
      { id: "r2", text: "Unknown unknowns" },
    ],
    answer: [
      { left: "l1", right: "r1" },
      { left: "l2", right: "r2" },
    ],
    rationales: { l1: "Known-unknowns.", l2: "Outside the baseline." },
  };

  it("matching keys every left to a distinct right, uses every right, and has no options", () => {
    expect(ok({ ...common, item_type: "matching", exhibit: matchingExhibit }).success).toBe(true);
    expect(ok({ ...common, item_type: "matching", exhibit: matchingExhibit, options: mcq }).success).toBe(false);
    const missing = { ...matchingExhibit, answer: [matchingExhibit.answer[0]] };
    expect(errs({ ...common, item_type: "matching", exhibit: missing })).toContain('left "l2" has no match in the key');
  });

  it("enhanced_matching needs an unmatched right item carrying a family and rationale", () => {
    const extraNoFamily = {
      ...matchingExhibit,
      kind: "enhanced_matching",
      right: [...matchingExhibit.right, { id: "r3", text: "Scope change budget" }],
    };
    expect(ok({ ...common, item_type: "enhanced_matching", exhibit: extraNoFamily }).success).toBe(false);
    const extra = {
      ...extraNoFamily,
      right: [...matchingExhibit.right, { id: "r3", text: "Scope change budget", distractor_family: "wrong_document_bucket", rationale: "Reserves never fund scope." }],
    };
    expect(ok({ ...common, item_type: "enhanced_matching", exhibit: extra }).success).toBe(true);
    // plain matching rejects the same extra item
    expect(ok({ ...common, item_type: "matching", exhibit: { ...extra, kind: "matching" } }).success).toBe(false);
  });

  it("point_and_click needs exactly one correct region and families on the rest", () => {
    const regions = [
      { id: "a", label: "SPI < 1", rect: { x: 0, y: 0, w: 0.5, h: 0.5 }, ...right },
      { id: "b", label: "CPI", rect: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, ...wrong("complacent_aggregate_read") },
    ];
    const exhibit = { kind: "point_and_click", base: { kind: "evm_dashboard", data: {} }, regions };
    expect(ok({ ...common, item_type: "point_and_click", exhibit }).success).toBe(true);
    const bad = { ...exhibit, regions: [regions[0], { ...regions[1], distractor_family: null }] };
    expect(ok({ ...common, item_type: "point_and_click", exhibit: bad }).success).toBe(false);
  });

  it("pull_down_list ties every blank to a placeholder with one correct choice", () => {
    const exhibit = {
      kind: "pull_down_list",
      template: "A supplier {{v}} deliver late, so the PM updates the {{doc}}.",
      blanks: [
        { id: "v", choices: [{ id: "may", text: "may", ...right }, { id: "has", text: "has", ...wrong("risk_issue_confusion") }] },
        { id: "doc", choices: [{ id: "rr", text: "risk register", ...right }, { id: "il", text: "issue log", ...wrong("risk_issue_confusion") }] },
      ],
    };
    expect(ok({ ...common, item_type: "pull_down_list", exhibit }).success).toBe(true);
    expect(errs({ ...common, item_type: "pull_down_list", exhibit: { ...exhibit, template: "No placeholders here at all." } })).toContain(
      "template is missing {{v}}",
    );
  });

  it("an exhibit-keyed type with the wrong exhibit kind is rejected", () => {
    expect(ok({ ...common, item_type: "pull_down_list", exhibit: matchingExhibit }).success).toBe(false);
  });
});
