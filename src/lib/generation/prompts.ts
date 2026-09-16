/**
 * Prompt builders. Everything exam-specific is pulled from config/exams/pmp.ts
 * so the mindset rules appear verbatim (build prompt §6.2) and the 2026
 * structural corrections are stated as facts (§5).
 */
import { PMP } from "../../../config/exams/pmp";
import { ITEM_TYPES, STYLES, DELIVERY_APPROACHES } from "@/db/schema";
import { formatContext, type RetrievedChunk } from "@/lib/retrieval";
import type { SyllabusItem } from "@/db/schema";

const PLAGIARISM_RULE =
  "Write ORIGINAL prose. Never reproduce more than 25 consecutive words from the source excerpts, and never reproduce a figure or table. Paraphrase, explain, and give your own examples.";

const CITATION_RULE =
  "Cite sources by the bracketed number of the excerpt, e.g. [2]. Every section and every question explanation must cite at least one excerpt. If the excerpts do not support a claim, do not make it.";

export function mindsetBlock(): string {
  return [
    "THE PMI MINDSET — the correct answer satisfies these; every distractor violates at least one:",
    ...PMP.mindsetRules.map((r, i) => `${i + 1}. ${r}`),
    "",
    "STRUCTURAL FACTS ABOUT PMBOK 8 / THE 2026 EXAM (many prep books get these wrong — you must not):",
    ...PMP.structuralFacts.map((f) => `- ${f}`),
  ].join("\n");
}

export function lessonSystemPrompt(): string {
  return [
    "You write study lessons for one candidate preparing for the PMP exam (2026 Exam Content Outline, PMBOK Guide 8th Edition).",
    "You are given numbered source excerpts with page references. Ground every statement in them.",
    PLAGIARISM_RULE,
    CITATION_RULE,
    mindsetBlock(),
    "Return ONLY a JSON object matching the requested shape. No prose outside the JSON.",
  ].join("\n\n");
}

export function lessonUserPrompt(item: SyllabusItem, chunks: RetrievedChunk[]): string {
  return [
    `ECO task: "${item.title}" (domain: ${PMP.domainLabels[item.domain as keyof typeof PMP.domainLabels] ?? item.domain}, code ${item.code}).`,
    "",
    "SOURCE EXCERPTS:",
    formatContext(chunks),
    "",
    "Write the lesson as JSON with exactly this shape:",
    `{
  "title_en": string,
  "title_my": string (a short Burmese rendering of the title; keep PMI terms in English),
  "summary_my": string (3–5 sentences in Burmese summarising the task; PMI terminology stays in English),
  "sections": {
    "what":       { "md": string (200–300 words, plain language: what this task actually is), "cites": number[] },
    "where":      { "md": string (which PMBOK 8 performance domain, which named processes, which focus areas), "cites": number[] },
    "predictive": { "md": string (how this task is done in a predictive life cycle), "cites": number[] },
    "adaptive":   { "md": string (how it is done in adaptive/hybrid delivery — ~60% of the exam), "cites": number[] },
    "artifacts":  { "md": string (every artifact this task touches, each tagged [business document — PM cannot change] / [PM plan component — CCB or management approval] / [project document — PM updates freely]), "cites": number[] },
    "traps":      { "md": string (5–8 specific ways PMI sets up a wrong answer here, as a markdown list), "cites": number[] },
    "example":    { "md": string (one realistic scenario reasoned through out loud using the mindset), "cites": number[] }
  },
  "pmbok_refs": string[] (section references like "Guide §2.7.3 Plan Risk Responses"),
  "flashcards": [ { "front": string, "back": string, "card_type": "recall" | "discrimination" | "application" } ] (exactly 12; mix the three types; discrimination cards read "X or Y?")
}`,
  ].join("\n");
}

export interface QuestionPlanEntry {
  item_type: (typeof ITEM_TYPES)[number];
  delivery_approach: (typeof DELIVERY_APPROACHES)[number];
  difficulty: 1 | 2 | 3;
  style: (typeof STYLES)[number];
}

export function questionSystemPrompt(): string {
  return [
    "You write exam-realistic PMP practice questions (2026 ECO, PMBOK Guide 8th Edition) for one candidate.",
    "Ground stems, correct answers and rationales in the numbered source excerpts. Scenarios are your own invention; facts are not.",
    PLAGIARISM_RULE,
    CITATION_RULE,
    mindsetBlock(),
    `DISTRACTOR FAMILIES — every wrong choice is labelled with exactly one, from this closed list:\n${PMP.distractorFamilies.map((f) => `- ${f}`).join("\n")}\nOver-represent "${PMP.emphasisedFamilies.join('", "')}" — it is the candidate's recorded weakness.`,
    "Every choice, right or wrong, gets a rationale. A right answer for the wrong reason fails the real exam.",
    "Stems must never depend on a fact that is not in the stem (no invented registers, plans or CCBs). Use may/might/could only for risks and will/has/is only for issues — deliberately.",
    "Randomise which position holds the correct option. The correct option must not be systematically the longest.",
    "Avoid absolutes (always, never, all, none, only) in wrong options unless the correct option uses one too.",
    "Return ONLY a JSON object. No prose outside the JSON.",
  ].join("\n\n");
}

const ITEM_TYPE_SHAPES: Record<string, string> = {
  single: `"options": [4 items: { "label": "A"|"B"|"C"|"D", "body", "is_correct" (exactly one true), "distractor_family" (null for the correct one), "rationale" }]`,
  multi: `"options": [5 items, labels A–E, exactly 2 or 3 with "is_correct": true; the stem says how many to select]`,
  graphic: `"exhibit": { "kind": one of burndown|burnup|network_diagram|control_chart|pareto|tornado|evm_dashboard|histogram|kanban|power_interest_grid, "title", "data": a small self-contained dataset the chart renders (e.g. burndown: {"sprintDays":10,"ideal":[..],"actual":[..]}; evm_dashboard: {"pv","ev","ac","bac"}; control_chart: {"ucl","lcl","mean","points":[..]}; pareto: {"categories":[{"name","count"}]}; network_diagram: {"activities":[{"id","duration","predecessors":[]}]}) }, plus "options" as for single. The stem must require READING a value off the exhibit AND deciding what the PM does about it — never only "what is the value".`,
  case: `"options" as for single. The stem opens with a 3–5 sentence scenario shared with the other case items and then asks one thing.`,
  matching: `"exhibit": { "kind": "matching", "left": [{ "id", "text" }] (3–5), "right": [{ "id", "text" }] (same count), "answer": [{ "left", "right" }], "rationales": { "<leftId>": string } } and "options": [] (empty).`,
  enhanced_matching: `"exhibit": { "kind": "enhanced_matching", "left": [3–5], "right": [left count + 1–2 extra entries that match nothing; each extra carries "distractor_family" and "rationale"], "answer": [...], "rationales": {...} } and "options": [].`,
  point_and_click: `"exhibit": { "kind": "point_and_click", "base": a chart spec as for graphic (or { "kind": "diagram", "description" }), "regions": [3–5: { "id", "label", "rect": { "x","y","w","h" } (fractions 0–1, non-overlapping), "is_correct" (exactly one true), "distractor_family", "rationale" }] } and "options": [].`,
  pull_down_list: `"exhibit": { "kind": "pull_down_list", "template": a sentence with placeholders like {{b1}} {{b2}}, "blanks": [{ "id": "b1", "choices": [3–4: { "id", "text", "is_correct" (exactly one), "distractor_family", "rationale" }] }] } and "options": [].`,
};

export function questionUserPrompt(item: SyllabusItem, chunks: RetrievedChunk[], plan: QuestionPlanEntry[], avoidStems: string[]): string {
  const shapes = [...new Set(plan.map((p) => p.item_type))].map((t) => `- ${t}: ${ITEM_TYPE_SHAPES[t]}`).join("\n");
  return [
    `ECO task: "${item.title}" (domain: ${item.domain}, code ${item.code}). Write ${plan.length} questions.`,
    "",
    "SOURCE EXCERPTS:",
    formatContext(chunks),
    "",
    "PLAN — one question per line, in this order:",
    ...plan.map((p, i) => `${i + 1}. item_type=${p.item_type} delivery_approach=${p.delivery_approach} difficulty=${p.difficulty} style=${p.style}`),
    "",
    "Difficulty 1 = recall/recognition, 2 = application in a scenario, 3 = judgement between two defensible-looking options where only the mindset separates them.",
    'style "first"/"next" stems ask what the PM should do FIRST/NEXT (ARA: analyse before acting); "what_should_pm_do" prefers the option covering most of RARA; "best" asks for the best option; "concept" tests a definition or distinction; "calculation" needs a numeric answer (still item_type single or multi).',
    "",
    "Shape per item_type:",
    shapes,
    "",
    avoidStems.length ? `Do not reuse these existing stems or close paraphrases:\n${avoidStems.map((s) => `- ${s.slice(0, 160)}`).join("\n")}\n` : "",
    `Return: { "questions": [ { "item_type", "delivery_approach", "difficulty", "style", "stem", "exhibit" (or null), "explanation_md" (2–4 sentences naming the mindset rule the correct answer satisfies and which family each distractor falls into), "pmbok_ref", "cites": number[] (excerpt numbers), "options": [...] } ] }`,
  ].join("\n");
}

export function reviseUserPrompt(original: unknown, problems: string[]): string {
  return [
    "Revise this question so that every listed problem is fixed. Keep the same item_type, delivery_approach, difficulty and style. Keep the same JSON shape (a single question object, with the same top-level keys including \"cites\").",
    "",
    "PROBLEMS:",
    ...problems.map((p) => `- ${p}`),
    "",
    "QUESTION:",
    JSON.stringify(original, null, 2),
    "",
    'Return: { "question": { ...revised question... } }',
  ].join("\n");
}

export function qaReviewSystemPrompt(): string {
  return [
    "You are an adversarial reviewer of PMP practice questions. Your job is to break the question, not to admire it.",
    mindsetBlock(),
    "Return ONLY JSON.",
  ].join("\n\n");
}

export function qaReviewUserPrompt(question: unknown, item: SyllabusItem, chunks: RetrievedChunk[]): string {
  return [
    `Tagged ECO task: "${item.title}".`,
    "",
    "SOURCE EXCERPTS the question claims to rest on:",
    formatContext(chunks),
    "",
    "QUESTION:",
    JSON.stringify(question, null, 2),
    "",
    "Attack it. Answer each:",
    "1. second_answer: is there a second defensible correct answer under the PMI mindset? (true/false, explain)",
    "2. stem_leaks: does the stem or an option leak the answer (length, absolutes, wording echo)?",
    "3. needs_unstated_fact: does the correct answer depend on a register, plan, CCB, or fact the stem never states?",
    "4. task_matches: does the content actually test the tagged ECO task?",
    "5. verb_consistent: are may/might/could vs will/has/is used correctly for risk vs issue?",
    "6. families_correct: does each wrong option truly belong to its labelled distractor family?",
    "7. grounded: is the correct answer supported by the excerpts?",
    "",
    `Return: { "verdict": "pass" | "revise" | "reject", "second_answer": boolean, "stem_leaks": boolean, "needs_unstated_fact": boolean, "task_matches": boolean, "verb_consistent": boolean, "families_correct": boolean, "grounded": boolean, "reasons": string[], "fix_hint": string }`,
    'Use "revise" when a targeted edit would fix it; "reject" when the premise is wrong or two answers are defensible.',
  ].join("\n");
}

export function groundingSystemPrompt(): string {
  return "You check whether cited source text actually supports a claim. Be strict and literal. Return ONLY JSON.";
}

export function groundingUserPrompt(claims: Array<{ claim: string; evidence: string }>): string {
  return [
    "For each item, does the EVIDENCE support the CLAIM? yes = clearly supported, partly = related but incomplete or slightly different, no = not supported or contradicted.",
    "",
    ...claims.map((c, i) => `#${i}\nCLAIM: ${c.claim}\nEVIDENCE: ${c.evidence}\n`),
    `Return: { "verdicts": [ { "i": number, "grounded": "yes" | "partly" | "no" } ] }`,
  ].join("\n");
}

export function explainSystemPrompt(): string {
  return [
    "You explain a PMP practice question the candidate got wrong, in a different way from the original rationale: a concrete analogy, a step-by-step walk through the mindset, and the single rule that separates the right option from the one they picked.",
    "Ground everything in the numbered excerpts; cite them as [n]. " + PLAGIARISM_RULE,
    mindsetBlock(),
    'Return ONLY JSON: { "md": string (markdown, 150–300 words), "cites": number[] }',
  ].join("\n\n");
}

export function askSystemPrompt(): string {
  return [
    "You answer a PMP candidate's question using ONLY the numbered source excerpts provided (PMBOK Guide 8th Edition and related PMI guides).",
    "If the excerpts do not contain the answer, set \"found\": false and say exactly: I could not find this in your materials. Do not guess and do not use outside knowledge.",
    "Cite every claim as [n]. " + PLAGIARISM_RULE,
    mindsetBlock(),
    'Return ONLY JSON: { "found": boolean, "md": string (markdown answer, under 250 words), "cites": number[] }',
  ].join("\n\n");
}

export function coachingSystemPrompt(): string {
  return [
    "You are a PMP study coach writing a weekly plain-language summary for one candidate from their attempt data. Name what is improving, what is not, which distractor families keep catching them, and one concrete focus for next week. Under 250 words. No percentages from samples under 30 questions — call those noisy.",
    'Return ONLY JSON: { "md": string }',
  ].join("\n\n");
}
