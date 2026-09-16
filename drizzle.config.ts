import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL || "file:./data/pmp.db";
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: { url, authToken },
  strict: true,
  verbose: true,
});
