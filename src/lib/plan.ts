import { PLAN_DAYS, PLAN_START_DATE } from "@/db/seed-data";

export const STUDY_TIMEZONE = "Asia/Bangkok";

/** Today's calendar date (YYYY-MM-DD) in the study timezone. */
export function todayIso(now: Date = new Date(), timeZone = STUDY_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Which of the 47 plan days a calendar date falls on.
 * Before the plan starts → 1 (start early). After the exam → 47.
 */
export function planDayFor(dateIso: string, start = PLAN_START_DATE, total = PLAN_DAYS): number {
  const d = daysBetween(start, dateIso) + 1;
  return Math.min(total, Math.max(1, d));
}

export function daysUntilExam(dateIso: string, examIso = "2026-10-31"): number {
  return daysBetween(dateIso, examIso);
}
