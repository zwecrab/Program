/**
 * Runs once when the Next.js server boots.
 * The `if` form (not an early return) matters: webpack's ConstPlugin prunes
 * the node-only imports from the edge bundle only when they sit inside the
 * NEXT_RUNTIME branch.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertRequiredEnv } = await import("./lib/env");
    assertRequiredEnv();
    const { migrateAndSeed } = await import("./db/migrate");
    await migrateAndSeed();
  }
}
