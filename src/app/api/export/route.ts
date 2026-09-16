import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { attempts, flashcards, lessons, options, questions, reviewItems, sessions, studyDays, syllabusItems } from "@/db/schema";
import { attemptsCsv } from "@/lib/analytics";

export const runtime = "nodejs";

/**
 * GET /api/export            → full JSON dump of study data (not source chunks — those stay local anyway)
 * GET /api/export?format=csv → attempts in the Excel tracker's columns (build prompt §10)
 */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format");
  if (format === "csv") {
    const csv = await attemptsCsv();
    return new NextResponse(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="pmp-attempts-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  }
  const dump = {
    exportedAt: new Date().toISOString(),
    syllabusItems: await db.select().from(syllabusItems),
    studyDays: await db.select().from(studyDays).orderBy(asc(studyDays.day)),
    lessons: await db.select().from(lessons),
    flashcards: await db.select().from(flashcards),
    questions: await Promise.all(
      (await db.select().from(questions)).map(async (q) => ({ ...q, options: await db.select().from(options).where(eq(options.questionId, q.id)) })),
    ),
    sessions: await db.select().from(sessions),
    attempts: await db.select().from(attempts),
    reviewItems: await db.select().from(reviewItems),
  };
  return new NextResponse(JSON.stringify(dump), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="pmp-trainer-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
