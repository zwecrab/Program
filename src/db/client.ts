import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema";
import { env } from "@/lib/env";

/**
 * One libSQL client per process. Local file in dev (`file:./data/pmp.db`),
 * Turso in prod (`libsql://...` + TURSO_AUTH_TOKEN). Same driver both ways.
 */
declare global {
  var __pmpDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
  var __pmpClient: Client | undefined;
}

function makeClient(): Client {
  const url = env.databaseUrl;
  if (url.startsWith("file:")) {
    const path = url.slice("file:".length);
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      /* directory exists or cannot be created; libsql will report */
    }
  }
  return createClient({ url, authToken: env.tursoAuthToken });
}

export const client: Client = globalThis.__pmpClient ?? (globalThis.__pmpClient = makeClient());
export const db = globalThis.__pmpDb ?? (globalThis.__pmpDb = drizzle(client, { schema }));
export { schema };
