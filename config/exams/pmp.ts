/**
 * PMP exam configuration — everything exam-specific lives here (build prompt
 * §6.2, §14; Phase 2 brief §20). A second exam (CFA) is a sibling file plus
 * new source material, not a fork of the code.
 */
import type { ExamConfig } from "./types";

export const PMP_DOMAINS = ["people", "process", "business_environment"] as const;
export type PmpDomain = (typeof PMP_DOMAINS)[number];

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

function items(domain: PmpDomain, prefix: string, rows: Array<[number, string]>, startId: number) {
  return rows.map(([planDay, title], i) => ({
    id: startId + i,
    domain,
    code: `${prefix}${i + 1}`,
    taskNumber: i + 1,
    title,
    planDay,
  }));
}

export const PMP: ExamConfig<PmpDomain> = {
  code: "PMP",
  title: "Project Management Professional (2026 ECO, PMBOK Guide 8th ed.)",
  examDate: "2026-10-31",
  questionCount: 180,
  scoredCount: 170,
  minutes: 240,
  breaks: { count: 2, minutes: 10 },
  pacingSecondsPerQuestion: 80,
  domains: PMP_DOMAINS,
  domainLabels: { people: "People", process: "Process", business_environment: "Business Environment" },
  domainWeights: { people: 33, process: 41, business_environment: 26 },
  /** IDs 1–8 People, 9–18 Process, 19–26 Business Environment, in ECO order. */
  syllabus: [
    ...items("people", "P", people, 1),
    ...items("process", "PR", process, 9),
    ...items("business_environment", "BE", businessEnvironment, 19),
  ],
  plan: { startDate: "2026-09-15", days: 47 },
  readinessGates: { overallPct: 70, domainPct: 65, mocksRequired: 3 },
  bank: {
    minPerItem: 120,
    deliveryMix: { predictive: 0.4, adaptive: 0.35, hybrid: 0.25 },
    difficultyMix: { 1: 0.25, 2: 0.5, 3: 0.25 },
    itemTypeMix: {
      single: 0.55,
      multi: 0.12,
      graphic: 0.1,
      case: 0.08,
      matching: 0.04,
      enhanced_matching: 0.03,
      pull_down_list: 0.04,
      point_and_click: 0.04,
    },
    topUpThreshold: 15,
  },
  distractorFamilies: [
    "escalate_prematurely",
    "wait_or_defer",
    "act_without_analysis",
    "overcorrect",
    "complacent_aggregate_read",
    "wrong_document_bucket",
    "risk_issue_confusion",
    "invented_process",
    "wrong_delivery_approach",
    "role_boundary_violation",
  ],
  /** Over-represent the recorded miss (build prompt §6.2 rule 10). */
  emphasisedFamilies: ["role_boundary_violation"],
  /** What each family means and the mindset rule it breaks — shown on the review screen and stored on review items. */
  familyRules: {
    escalate_prematurely: { label: "Escalated before analysing", rule: "Be responsible: solve at your own level first; escalation follows analysis that has exhausted the PM's authority." },
    wait_or_defer: { label: "Waited or deferred", rule: "Be proactive: the PM acts before the problem lands; options that wait, watch or revisit are wrong." },
    act_without_analysis: { label: "Acted without analysing", rule: "ARA for FIRST/NEXT: understand before acting; the first move is almost never a decision or a change request." },
    overcorrect: { label: "Overcorrected", rule: "Proportionate response: re-planning everything is as wrong as doing nothing." },
    complacent_aggregate_read: { label: "Read the aggregate, missed the detail", rule: "Analyse the variance and its cause; a single headline number can hide the problem." },
    wrong_document_bucket: { label: "Wrong document bucket", rule: "Three buckets: business documents (PM cannot change), PM plan (CCB/management approval), project documents (PM updates freely)." },
    risk_issue_confusion: { label: "Confused risk with issue", rule: "Read the verb: may/might/could = risk → risk register; will/has/is = issue → issue log and corrective action." },
    invented_process: { label: "Assumed an unstated process", rule: "Never invent process: if the stem does not say a register, plan or CCB exists, the answer may not assume one." },
    wrong_delivery_approach: { label: "Wrong delivery approach", rule: "Match the life cycle: predictive artifacts and adaptive ceremonies are not interchangeable." },
    role_boundary_violation: { label: "Crossed the PM's role boundary", rule: "Role boundary: when stakeholders are divided, analyse and present options — never pick one and execute." },
  },
  // Verbatim from the build prompt §6.2 — the rules the correct answer must satisfy and the distractors must violate.
  mindsetRules: [
    "Be proactive. The PM acts before the problem lands. Options that wait, watch, monitor, or revisit after go-live are wrong.",
    "Be responsible. Solve at your own level first. Escalating to the sponsor, PMO or management is never the first move — it is what happens after analysis has exhausted the PM's authority.",
    "RARA — Record → Analyze → Review → Act. For \"what should the PM do?\", the best option covers the most of that cycle.",
    "ARA for FIRST/NEXT. For \"what should the PM do FIRST\" or \"NEXT\", drop Record: understand before acting. The first move is almost never a decision, a change request, or a conversation with the sponsor.",
    "Read the verb. May · might · could = a risk that has not happened → risk register, risk response planning. Will · has · is = an issue that is real → issue log, corrective action. Stems must use these verbs consistently and deliberately.",
    "Three buckets. Business documents (business case, benefits management plan) — the PM cannot change them. Project management plan — CCB or management approval required. Project documents — PM updates freely.",
    "Baseline touched → change request. No exceptions, however sensible the shortcut sounds. Contingency reserve funds identified risks, never a scope change.",
    "Never invent process. If the stem does not say a register, plan, CCB or process exists, the correct answer may not assume one. The generator must not write a stem whose answer depends on an unstated fact.",
    "Proportionate response. \"Mitigate across all workstreams\", \"re-plan the whole project\", \"diversify everything immediately\" — overcorrection is wrong, and so is its opposite.",
    "Role boundary. When stakeholders are divided and ask the PM for a recommendation, the answer is analyse and present options — never pick one and execute.",
  ],
  // Build prompt §5 — structural corrections that most prep material still gets wrong.
  structuralFacts: [
    "Quality is not a performance domain — Manage Quality Assurance is a Governance process.",
    "Procurement is not a performance domain — Plan Sourcing Strategy is a Governance process; detail lives in Appendix X4.",
    "Communications is folded into the Stakeholders domain (3 of its 7 processes).",
    "Qualitative and quantitative risk analysis are merged into one Perform Risk Analysis process.",
    "PMBOK 8 performance domains: Governance, Scope, Schedule, Finance, Stakeholders, Resources, Risk. Roughly 60% of the exam is adaptive or hybrid.",
  ],
  /** Source slug → syllabus item ids the slice mainly serves (used to tag chunks at index time). */
  sourceToSyllabus: {
    principles: [1, 2, 3, 9, 11, 19, 34],
    lifecycles: [9, 11, 16, 34, 35],
    "pd-governance": [9, 11, 13, 15, 18, 19, 20, 21, 24, 26],
    "pd-scope": [10, 11, 21],
    "pd-schedule": [16, 17],
    "pd-finance": [14, 17],
    "pd-stakeholders": [4, 5, 6, 8],
    "pd-resources": [1, 2, 3, 7, 12],
    "pd-risk": [22, 23, 26],
    tailoring: [9, 24],
    "inputs-outputs": [9, 10, 11, 16, 17, 18],
    tools: [11, 12, 14, 15, 16, 23],
    pmos: [19],
    ai: [12, 24],
    procurement: [13],
    evolution: [9],
    "agile-guide": [9, 10, 11, 16, 17, 18, 22, 24],
    "change-guide": [25, 26],
  },
};

export default PMP;
