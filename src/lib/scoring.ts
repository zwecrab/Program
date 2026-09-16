/**
 * Pure scoring for all eight item types. The answer shape per type is
 * DECISIONS #13; `chosen` mirrors it:
 *   option-based → number[] of option ids
 *   matching     → Record<leftId, rightId>
 *   point_and_click → string (region id)
 *   pull_down_list  → Record<blankId, choiceId>
 */
import type { Exhibit } from "@/lib/question-schema";
import type { Option } from "@/db/schema";

export type Chosen = number[] | Record<string, string> | string | null;

export interface ScoreResult {
  isCorrect: boolean;
  /** Family of the first wrong choice the learner made (for analytics). */
  family: string | null;
  /** Per-part correctness for partial display (matching pairs, blanks). */
  parts?: Array<{ id: string; correct: boolean }>;
}

export function scoreAnswer(itemType: string, options: Option[], exhibit: Exhibit | null, chosen: Chosen): ScoreResult {
  if (["single", "multi", "graphic", "case"].includes(itemType)) {
    const ids = Array.isArray(chosen) ? chosen : [];
    const correctIds = options.filter((o) => o.isCorrect).map((o) => o.id);
    const chosenSet = new Set(ids);
    const isCorrect = correctIds.length === chosenSet.size && correctIds.every((id) => chosenSet.has(id));
    const wrong = options.find((o) => chosenSet.has(o.id) && !o.isCorrect);
    return { isCorrect, family: isCorrect ? null : wrong?.distractorFamily ?? null };
  }
  if (!exhibit) return { isCorrect: false, family: null };

  if (exhibit.kind === "matching" || exhibit.kind === "enhanced_matching") {
    const map = typeof chosen === "object" && chosen && !Array.isArray(chosen) ? chosen : {};
    const parts = exhibit.answer.map((a) => ({ id: a.left, correct: map[a.left] === a.right }));
    const isCorrect = parts.every((p) => p.correct);
    let family: string | null = null;
    if (!isCorrect) {
      const usedIds = new Set(exhibit.answer.map((a) => a.right));
      const wrongPick = exhibit.right.find((r) => Object.values(map).includes(r.id) && !usedIds.has(r.id) && r.distractor_family);
      family = wrongPick?.distractor_family ?? "act_without_analysis";
    }
    return { isCorrect, family, parts };
  }
  if (exhibit.kind === "point_and_click") {
    const region = exhibit.regions.find((r) => r.id === chosen);
    return { isCorrect: !!region?.is_correct, family: region && !region.is_correct ? region.distractor_family ?? null : null };
  }
  if (exhibit.kind === "pull_down_list") {
    const map = typeof chosen === "object" && chosen && !Array.isArray(chosen) ? chosen : {};
    const parts = exhibit.blanks.map((b) => ({ id: b.id, correct: b.choices.find((c) => c.is_correct)?.id === map[b.id] }));
    const isCorrect = parts.every((p) => p.correct);
    let family: string | null = null;
    if (!isCorrect) {
      for (const b of exhibit.blanks) {
        const pick = b.choices.find((c) => c.id === map[b.id]);
        if (pick && !pick.is_correct) {
          family = pick.distractor_family ?? null;
          break;
        }
      }
    }
    return { isCorrect, family, parts };
  }
  return { isCorrect: false, family: null };
}

/** Correct-answer key in a display-ready form. */
export function correctKey(itemType: string, options: Option[], exhibit: Exhibit | null): string {
  if (["single", "multi", "graphic", "case"].includes(itemType)) return options.filter((o) => o.isCorrect).map((o) => o.label).join(", ");
  if (!exhibit) return "";
  if (exhibit.kind === "matching" || exhibit.kind === "enhanced_matching")
    return exhibit.answer.map((a) => `${exhibit.left.find((l) => l.id === a.left)?.text} → ${exhibit.right.find((r) => r.id === a.right)?.text}`).join("; ");
  if (exhibit.kind === "point_and_click") return exhibit.regions.find((r) => r.is_correct)?.label ?? "";
  if (exhibit.kind === "pull_down_list") return exhibit.blanks.map((b) => b.choices.find((c) => c.is_correct)?.text ?? "").join(" · ");
  return "";
}
