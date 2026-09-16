import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

/**
 * PWA (build prompt §2, §12): installable, offline-capable for lessons and
 * flashcards; practice and exams need the network (they write attempts and
 * enforce the clock server-side). The service worker is generated at build
 * time from src/app/sw.ts and disabled in dev.
 */
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // libSQL and onnxruntime ship native bindings; keep them out of the bundler.
  serverExternalPackages: ["@libsql/client", "libsql", "@huggingface/transformers", "onnxruntime-node", "pdf-parse"],
  // Migrations are read from disk at boot — include them in serverless bundles.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
};

export default withSerwist(nextConfig);
