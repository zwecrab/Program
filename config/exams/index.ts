import { PMP } from "./pmp";
import type { ExamConfig } from "./types";

export const EXAMS: Record<string, ExamConfig> = { PMP: PMP as ExamConfig };

/** The exam this deployment is studying for. One at a time; a CFA build sets ACTIVE_EXAM=CFA1. */
export function activeExam(): ExamConfig {
  const code = process.env.ACTIVE_EXAM || "PMP";
  const exam = EXAMS[code];
  if (!exam) throw new Error(`Unknown ACTIVE_EXAM "${code}". Known: ${Object.keys(EXAMS).join(", ")}`);
  return exam;
}

export type { ExamConfig, SyllabusItemConfig } from "./types";
