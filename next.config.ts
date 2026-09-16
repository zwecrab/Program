import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // libSQL ships native bindings; keep it out of the bundler.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // Migrations are read from disk at boot — include them in serverless bundles.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
};

export default nextConfig;
