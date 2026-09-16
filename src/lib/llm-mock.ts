/**
 * Offline stand-in for OpenRouter (LLM_TRANSPORT=mock). Produces schema-valid
 * JSON for every purpose so the pipeline, QA and UI can be exercised without
 * network or spend. Content is deliberately generic — never use it to build
 * the real bank.
 */
import type { ChatRequest } from "./llm";


function planFromPrompt(user: string) {
  const lines = user.split("\n").filter((l) => /^\d+\. item_type=/.test(l));
  return lines.map((l) => {
    const get = (k: string) => l.match(new RegExp(`${k}=(\\S+)`))?.[1] ?? "";
    return { item_type: get("item_type"), delivery_approach: get("delivery_approach"), difficulty: Number(get("difficulty")), style: get("style") };
  });
}

function excerptCount(user: string): number {
  return (user.match(/^\[\d+\] /gm) ?? []).length;
}

let counter = 0;

function mockQuestion(p: { item_type: string; style: string; difficulty: number }, n: number, cites: number[]) {
  counter++;
  const tag = `${counter}-${n}`;
  const stem =
    p.style === "first" || p.style === "next"
      ? `During execution a key supplier reports that a component may arrive two weeks late (case ${tag}). What should the project manager do ${p.style === "first" ? "first" : "next"}?`
      : p.style === "calculation"
        ? `A project has PV 200,000, EV 180,000 and AC 210,000 at the status date (case ${tag}). Which statement best describes the situation and the PM's next step?`
        : `Stakeholders are divided over two competing designs and ask the project manager for a recommendation (case ${tag}). What should the project manager do?`;
  const explanation = `The correct option applies analyse-before-act and stays within the PM's authority [${cites[0] ?? 1}]. The distractors escalate early, wait, or act without analysis.`;
  const base = { stem, explanation_md: explanation, pmbok_ref: "Guide §2.7.3 Plan Risk Responses", cites, exhibit: null as unknown, options: [] as unknown[] };
  const mk = (label: string, body: string, correct: boolean, fam: string | null) => ({ label, body, is_correct: correct, distractor_family: fam, rationale: correct ? "Analyses impact first and updates the register." : `Falls into ${fam}.` });

  switch (p.item_type) {
    case "single":
    case "case":
      base.options = [
        mk("A", "Analyse the schedule impact and update the risk register with a response owner.", true, null),
        mk("B", "Escalate the delay to the sponsor for a decision.", false, "escalate_prematurely"),
        mk("C", "Wait to see whether the delay materialises before acting.", false, "wait_or_defer"),
        mk("D", "Log it in the issue log and take corrective action immediately.", false, "risk_issue_confusion"),
      ];
      return base;
    case "multi":
      base.stem = `${stem} (Choose two.)`;
      base.options = [
        mk("A", "Analyse the schedule impact with the team.", true, null),
        mk("B", "Record the risk with an owner and trigger.", true, null),
        mk("C", "Escalate to the PMO.", false, "escalate_prematurely"),
        mk("D", "Wait for the next status meeting.", false, "wait_or_defer"),
        mk("E", "Re-plan the whole project schedule.", false, "overcorrect"),
      ];
      return base;
    case "graphic":
      base.exhibit = { kind: "evm_dashboard", title: "Status at month 6", data: { pv: 200000, ev: 180000, ac: 210000, bac: 500000 } };
      base.stem = `The dashboard shows the project's earned value figures (case ${tag}). Reading CPI and SPI, what should the project manager do?`;
      base.options = [
        mk("A", "Analyse the variance causes before proposing corrective action.", true, null),
        mk("B", "Request additional budget from the sponsor now.", false, "escalate_prematurely"),
        mk("C", "Cut scope across all workstreams to recover cost.", false, "overcorrect"),
        mk("D", "Note the figures and re-check next month.", false, "wait_or_defer"),
      ];
      return base;
    case "matching":
    case "enhanced_matching": {
      const right = [
        { id: "r1", text: "Identified risks, inside the baseline" },
        { id: "r2", text: "Unknown unknowns, outside the baseline" },
        { id: "r3", text: "Real event already happened" },
      ];
      if (p.item_type === "enhanced_matching") right.push({ id: "r4", text: "Approved scope change funding", ...{ distractor_family: "wrong_document_bucket", rationale: "Reserves never fund scope changes." } } as never);
      base.exhibit = {
        kind: p.item_type,
        left: [
          { id: "l1", text: "Contingency reserve" },
          { id: "l2", text: "Management reserve" },
          { id: "l3", text: "Issue" },
        ],
        right,
        answer: [
          { left: "l1", right: "r1" },
          { left: "l2", right: "r2" },
          { left: "l3", right: "r3" },
        ],
        rationales: { l1: "Known risks.", l2: "Unknown unknowns.", l3: "Has happened." },
      };
      base.stem = `Match each term to its description (case ${tag}).`;
      return base;
    }
    case "point_and_click":
      base.exhibit = {
        kind: "point_and_click",
        base: { kind: "evm_dashboard", title: "EVM", data: { pv: 200000, ev: 180000, ac: 210000, bac: 500000 } },
        regions: [
          { id: "a", label: "CPI", rect: { x: 0, y: 0, w: 0.5, h: 0.5 }, is_correct: true, distractor_family: null, rationale: "Cost efficiency is the concern." },
          { id: "b", label: "SPI", rect: { x: 0.5, y: 0, w: 0.5, h: 0.5 }, is_correct: false, distractor_family: "complacent_aggregate_read", rationale: "Schedule is not the issue here." },
          { id: "c", label: "BAC", rect: { x: 0, y: 0.5, w: 1, h: 0.5 }, is_correct: false, distractor_family: "act_without_analysis", rationale: "BAC is a plan figure." },
        ],
      };
      base.stem = `Click the indicator the PM should analyse first given the overspend (case ${tag}).`;
      return base;
    case "pull_down_list":
      base.exhibit = {
        kind: "pull_down_list",
        template: "A supplier {{v}} deliver late, so the PM records it in the {{doc}}.",
        blanks: [
          {
            id: "v",
            choices: [
              { id: "may", text: "may", is_correct: true, distractor_family: null, rationale: "Uncertain — a risk." },
              { id: "has", text: "has", is_correct: false, distractor_family: "risk_issue_confusion", rationale: "Would make it an issue." },
            ],
          },
          {
            id: "doc",
            choices: [
              { id: "rr", text: "risk register", is_correct: true, distractor_family: null, rationale: "Risks live here." },
              { id: "il", text: "issue log", is_correct: false, distractor_family: "risk_issue_confusion", rationale: "Only for realised events." },
            ],
          },
        ],
      };
      base.stem = `Complete the sentence (case ${tag}).`;
      return base;
    default:
      return base;
  }
}

export async function mockRespond(req: ChatRequest): Promise<{ text: string }> {
  const n = Math.max(1, excerptCount(req.user));
  const cites = n >= 2 ? [1, 2] : [1];
  switch (req.purpose) {
    case "lesson": {
      const sec = (t: string) => ({ md: `${t} — this section explains the task in original prose grounded in the excerpts. `.repeat(3) + `[${cites[0]}]`, cites });
      const cards = Array.from({ length: 12 }, (_, i) => ({
        front: i % 3 === 0 ? `Term ${i + 1}: what is it?` : i % 3 === 1 ? `Contingency reserve or management reserve? (${i + 1})` : `Apply: a supplier may be late — first move? (${i + 1})`,
        back: "Mock answer.",
        card_type: (["recall", "discrimination", "application"] as const)[i % 3],
      }));
      return {
        text: JSON.stringify({
          title_en: "Mock lesson",
          title_my: "Mock lesson (MY)",
          summary_my: "အနှစ်ချုပ် mock.",
          sections: { what: sec("What"), where: sec("Where"), predictive: sec("Predictive"), adaptive: sec("Adaptive"), artifacts: sec("Artifacts"), traps: sec("Traps"), example: sec("Example") },
          pmbok_refs: ["Guide §2.7"],
          flashcards: cards,
        }),
      };
    }
    case "questions": {
      const plan = planFromPrompt(req.user);
      return { text: JSON.stringify({ questions: plan.map((p, i) => mockQuestion(p, i, cites)) }) };
    }
    case "question_revise": {
      const m = req.user.match(/QUESTION:\n([\s\S]*?)\n\nReturn:/);
      const q = m ? JSON.parse(m[1]) : {};
      return { text: JSON.stringify({ question: { ...q, stem: `${q.stem ?? "Revised stem"} (revised)`, cites } }) };
    }
    case "qa_review": {
      const flagged = /REVISEME/.test(req.user);
      return {
        text: JSON.stringify({
          verdict: flagged ? "revise" : "pass",
          second_answer: false,
          stem_leaks: flagged,
          needs_unstated_fact: false,
          task_matches: true,
          verb_consistent: true,
          families_correct: true,
          grounded: true,
          reasons: flagged ? ["stem leaks the answer"] : [],
          fix_hint: flagged ? "tighten the stem" : "",
        }),
      };
    }
    case "grounding": {
      const count = (req.user.match(/^#\d+$/gm) ?? []).length;
      return { text: JSON.stringify({ verdicts: Array.from({ length: count }, (_, i) => ({ i, grounded: /\(no citation\)/.test(req.user.split(`#${i}\n`)[1]?.split("\n#")[0] ?? "") ? "no" : "yes" })) } ) };
    }
    case "explain":
      return { text: JSON.stringify({ md: `Think of it as a smoke alarm: you check where the smoke is before calling the fire brigade. The rule that separates the options is analyse-before-act [${cites[0]}].`, cites }) };
    case "ask": {
      const q = (req.user.match(/QUESTION:\s*([\s\S]*)$/)?.[1] ?? "").toLowerCase();
      const excerpts = req.user.toLowerCase();
      const words = q.replace(/[^a-z\s]/g, " ").split(/\s+/).filter((w) => w.length > 4);
      const overlap = words.filter((w) => excerpts.split("question:")[0].includes(w)).length;
      const found = n > 0 && overlap >= 2;
      return { text: JSON.stringify(found ? { found: true, md: `Grounded mock answer [${cites[0]}].`, cites } : { found: false, md: "I could not find this in your materials.", cites: [] }) };
    }
    case "coaching":
      return { text: JSON.stringify({ md: "Mock weekly summary: accuracy is improving; escalate_prematurely still catches you. Focus next week on FIRST/NEXT questions." }) };
    case "validate":
    default:
      return { text: "{}" };
  }
}
