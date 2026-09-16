"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
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
    <Card>
      <h1 className="mb-1 text-xl font-semibold">PMP Trainer</h1>
      <p className="mb-4 text-sm text-muted">Private study app. Enter your passphrase.</p>
      <form onSubmit={onSubmit} className="space-y-3">
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
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
