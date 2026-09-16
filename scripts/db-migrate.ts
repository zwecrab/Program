/**
 * Apply migrations and seed reference data against DATABASE_URL.
 * Usage: npm run db:migrate
 */
import "dotenv/config";
import { migrateAndSeed } from "../src/db/migrate";

migrateAndSeed()
  .then(() => {
    console.log(`Migrated and seeded ${process.env.DATABASE_URL || "file:./data/pmp.db"}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
