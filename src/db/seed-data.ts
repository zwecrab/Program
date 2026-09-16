/**
 * Reference data seeded on first migration.
 * Source: build prompt §3 and §14 (2026 ECO, 47-day roadmap).
 */
import type { Domain } from "./schema";

export const DOMAIN_WEIGHTS: Record<Domain, number> = {
  people: 33,
  process: 41,
  business_environment: 26,
};

export const DOMAIN_LABELS: Record<Domain, string> = {
  people: "People",
  process: "Process",
  business_environment: "Business Environment",
};

export interface EcoTaskSeed {
  id: number;
  domain: Domain;
  taskNumber: number;
  title: string;
  planDay: number;
}

const people: Array<[number, string]> = [
  [20, "Develop a common vision"],
  [21, "Manage conflicts"],
  [22, "Lead the project team"],
  [23, "Engage stakeholders"],
  [24, "Align stakeholder expectations"],
  [25, "Manage stakeholder expectations"],
  [26, "Help ensure knowledge transfer"],
  [26, "Plan and manage communication"],
];

const process: Array<[number, string]> = [
  [7, "Develop an integrated project management plan and plan delivery"],
  [8, "Develop and manage project scope"],
  [9, "Help ensure value-based delivery"],
  [10, "Plan and manage resources"],
  [11, "Plan and manage procurement"],
  [12, "Plan and manage finance"],
  [14, "Plan and optimize quality of products/deliverables"],
  [15, "Plan and manage schedule"],
  [16, "Evaluate project status"],
  [17, "Manage project closure"],
];

const businessEnvironment: Array<[number, string]> = [
  [29, "Define and establish project governance"],
  [30, "Plan and manage project compliance"],
  [31, "Manage and control changes"],
  [32, "Remove impediments and manage issues"],
  [33, "Plan and manage risk"],
  [34, "Continuous improvement"],
  [35, "Support organizational change"],
  [36, "Evaluate external business environment changes"],
];

function build(domain: Domain, rows: Array<[number, string]>, startId: number): EcoTaskSeed[] {
  return rows.map(([planDay, title], i) => ({
    id: startId + i,
    domain,
    taskNumber: i + 1,
    title,
    planDay,
  }));
}

/** IDs: 1–8 People, 9–18 Process, 19–26 Business Environment. */
export const ECO_TASKS: EcoTaskSeed[] = [
  ...build("people", people, 1),
  ...build("process", process, 9),
  ...build("business_environment", businessEnvironment, 19),
];

/**
 * `eco_tasks.weight_pct` carries the domain weight verbatim (33 / 41 / 26).
 * Dividing it across tasks produced rounding drift (8 × 4.13 = 33.04), and
 * PMI publishes weights per domain, not per task. Analytics must aggregate
 * by domain, never sum this column across tasks.
 */
export function taskWeightPct(domain: Domain): number {
  return DOMAIN_WEIGHTS[domain];
}

// ---------------------------------------------------------------------------
// 47-day roadmap. Day 1 = 2026-09-15, day 47 = 2026-10-31 (exam day).
// ---------------------------------------------------------------------------

export const PLAN_START_DATE = "2026-09-15";
export const EXAM_DATE = "2026-10-31";
export const PLAN_DAYS = 47;

export interface StudyDaySeed {
  day: number;
  date: string;
  phase: string;
  focus: string;
}

function dateForDay(day: number): string {
  const d = new Date(`${PLAN_START_DATE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (day - 1));
  return d.toISOString().slice(0, 10);
}

const FOUNDATION: Record<number, string> = {
  1: "Orientation: 2026 exam format, ECO structure, set up the app",
  2: "Cold baseline: 15-question mixed mini test (recorded)",
  3: "PMBOK 8 Standard §3: the six principles",
  4: "PMBOK 8 Standard §4: life cycles, delivery approaches, focus areas",
  5: "The PMI mindset: proactive, responsible, RARA/ARA, risk vs issue, three document buckets",
  6: "Agile Practice Guide ch. 2–5: adaptive and hybrid fundamentals",
};

const REVIEW_DAYS: Record<number, [string, string]> = {
  13: ["process", "Process mid-review: tasks 1–6 recap + mini test"],
  18: ["process", "Process domain review: weak-area drill, flashcard sweep"],
  19: ["process", "Mock exam 1 (180 questions, 240 minutes)"],
  27: ["people", "People domain review + mini test"],
  28: ["people", "Mock 1 error-log review: which distractor families caught you"],
  37: ["business_environment", "Business Environment review + mini test"],
  38: ["consolidation", "Mock exam 2 (180 questions, 240 minutes)"],
  39: ["consolidation", "Mock 2 review: distractor-family tally vs mock 1"],
  40: ["consolidation", "Weak-area drill: Process"],
  41: ["consolidation", "Weak-area drill: People"],
  42: ["consolidation", "Weak-area drill: Business Environment + calculations (EVM, CPM)"],
  43: ["consolidation", "Error log read-through: every review item, resolve or re-drill"],
  44: ["consolidation", "Mock exam 3 (180 questions, 240 minutes)"],
  45: ["consolidation", "Mock 3 review + readiness gate check"],
  46: ["consolidation", "Light review: formulas, principles, rest early"],
  47: ["consolidation", "EXAM DAY — PMP, 31 October 2026"],
};

export function buildStudyDays(): StudyDaySeed[] {
  const byDay = new Map<number, string[]>();
  for (const t of ECO_TASKS) {
    const list = byDay.get(t.planDay) ?? [];
    list.push(t.title);
    byDay.set(t.planDay, list);
  }
  const days: StudyDaySeed[] = [];
  for (let day = 1; day <= PLAN_DAYS; day++) {
    let phase: string;
    let focus: string;
    if (FOUNDATION[day]) {
      phase = "foundation";
      focus = FOUNDATION[day];
    } else if (REVIEW_DAYS[day]) {
      [phase, focus] = REVIEW_DAYS[day];
    } else {
      const tasks = byDay.get(day) ?? [];
      const domain = ECO_TASKS.find((t) => t.planDay === day)?.domain ?? "process";
      phase = domain;
      focus = tasks.length ? `ECO task: ${tasks.join(" · ")}` : "Buffer / catch-up";
    }
    days.push({ day, date: dateForDay(day), phase, focus });
  }
  return days;
}

/** The one real data point before any study: 16 Sep 2026, 15 mixed questions, 4 correct. */
export const BASELINE_SESSION = {
  kind: "mini" as const,
  startedAt: "2026-09-16T10:00:00.000Z",
  endedAt: "2026-09-16T10:25:00.000Z",
  configJson: JSON.stringify({
    label: "Cold baseline",
    domains: "mixed",
    questions: 15,
    correct: 4,
    note: "Taken before any study; questions were external, so no attempt rows exist.",
  }),
  scorePct: Math.round((4 / 15) * 1000) / 10, // 26.7
};

export const DEFAULT_SETTINGS: Record<string, string> = {
  locale: "en",
  domain_weights_json: JSON.stringify(DOMAIN_WEIGHTS),
  monthly_llm_cap_usd: "5",
  exam_date: EXAM_DATE,
  seed_version: "1",
};
