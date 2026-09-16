/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { NetworkFirst, NetworkOnly, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Practice, exams and every mutation need the server: never serve stale.
    { matcher: ({ url }) => /^\/(session|exam)\//.test(url.pathname) || url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    // Lessons, flashcards, plan and today: network first, fall back to the last good copy offline (build prompt §12).
    {
      matcher: ({ url, request }) => request.mode === "navigate" && /^\/(lesson\/|flashcards|plan|errors|$)/.test(url.pathname),
      handler: new NetworkFirst({ cacheName: "pages", networkTimeoutSeconds: 4, plugins: [{ cacheWillUpdate: async ({ response }) => (response.status === 200 ? response : null) }] }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }],
  },
});

serwist.addEventListeners();
