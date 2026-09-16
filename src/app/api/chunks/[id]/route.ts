import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sourceChunks } from "@/db/schema";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const [row] = await db
    .select({ id: sourceChunks.id, text: sourceChunks.text, book: sourceChunks.sourceBook, section: sourceChunks.sourceSection, printedPage: sourceChunks.printedPage, pdfPage: sourceChunks.pdfPageStart })
    .from(sourceChunks)
    .where(eq(sourceChunks.id, n))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}
