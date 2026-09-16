import { describe, expect, it } from "vitest";
import { daysUntilExam, planDayFor, todayIso } from "@/lib/plan";
import { ECO_TASKS, buildStudyDays, taskWeightPct, BASELINE_SESSION } from "@/db/seed-data";

describe("plan calendar", () => {
  it("maps the roadmap start and exam day", () => {
    expect(planDayFor("2026-09-15")).toBe(1);
    expect(planDayFor("2026-09-16")).toBe(2);
    expect(planDayFor("2026-10-31")).toBe(47);
  });
  it("clamps outside the plan window", () => {
    expect(planDayFor("2026-09-01")).toBe(1);
    expect(planDayFor("2026-11-05")).toBe(47);
  });
  it("uses the study timezone for today", () => {
    // 2026-09-16T20:00Z is already 17 Sep in Bangkok (UTC+7)
    expect(todayIso(new Date("2026-09-16T20:00:00Z"))).toBe("2026-09-17");
    expect(todayIso(new Date("2026-09-16T16:59:00Z"))).toBe("2026-09-16");
  });
  it("counts days until the exam", () => {
    expect(daysUntilExam("2026-09-16")).toBe(45);
    expect(daysUntilExam("2026-10-31")).toBe(0);
  });
});

describe("seed data", () => {
  it("has 26 ECO tasks in the 8/10/8 split", () => {
    expect(ECO_TASKS).toHaveLength(26);
    expect(ECO_TASKS.filter((t) => t.domain === "people")).toHaveLength(8);
    expect(ECO_TASKS.filter((t) => t.domain === "process")).toHaveLength(10);
    expect(ECO_TASKS.filter((t) => t.domain === "business_environment")).toHaveLength(8);
    expect(new Set(ECO_TASKS.map((t) => t.id)).size).toBe(26);
  });
  it("task weights sum to the domain weights", () => {
    const sum = ECO_TASKS.reduce((a, t) => a + taskWeightPct(t.domain), 0);
    expect(Math.round(sum)).toBe(100);
  });
  it("builds 47 study days from 15 Sep to 31 Oct 2026", () => {
    const days = buildStudyDays();
    expect(days).toHaveLength(47);
    expect(days[0]).toMatchObject({ day: 1, date: "2026-09-15" });
    expect(days[46]).toMatchObject({ day: 47, date: "2026-10-31" });
    // every ECO task's plan day exists and mentions the task
    for (const t of ECO_TASKS) {
      const d = days.find((x) => x.day === t.planDay)!;
      expect(d.focus).toContain(t.title);
    }
  });
  it("records the 4/15 baseline as 26.7%", () => {
    expect(BASELINE_SESSION.scorePct).toBe(26.7);
    expect(BASELINE_SESSION.startedAt.startsWith("2026-09-16")).toBe(true);
  });
});
