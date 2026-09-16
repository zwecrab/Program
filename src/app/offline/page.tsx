import Link from "next/link";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-md px-4 pt-24 text-center">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">Offline</p>
      <h1 className="mt-1 text-3xl">No connection</h1>
      <p className="mt-3 text-sm text-fg-muted">Lessons and flashcards you have opened before are available offline. Practice sets and exams need the network — they record your answers and keep the clock on the server.</p>
      <Link href="/" className="mt-6 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
        Try again
      </Link>
    </main>
  );
}
