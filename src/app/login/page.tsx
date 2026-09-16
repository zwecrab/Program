"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase }),
    });
    setBusy(false);
    if (res.ok) {
      const next = params.get("next") || "/";
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Could not sign in.");
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 pt-20">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Private study app</p>
      <h1 className="mb-6 text-3xl">PMP Trainer</h1>
      <Card className="p-5">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="passphrase">Passphrase</Label>
            <Input
              id="passphrase"
              name="passphrase"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-sm text-incorrect">{error}</p> : null}
          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
