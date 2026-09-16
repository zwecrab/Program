import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { passphraseMatches, rateLimit } from "@/lib/auth";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let passphrase = "";
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { passphrase?: string };
    passphrase = body.passphrase ?? "";
  } else {
    const form = await req.formData().catch(() => null);
    passphrase = String(form?.get("passphrase") ?? "");
  }

  if (!passphraseMatches(passphrase, env.appPassphrase)) {
    return NextResponse.json({ error: "Wrong passphrase." }, { status: 401 });
  }

  const session = await getSession();
  session.authenticated = true;
  session.loggedInAt = Date.now();
  await session.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
