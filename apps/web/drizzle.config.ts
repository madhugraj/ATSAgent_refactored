import { defineConfig } from "drizzle-kit";

// The schema and its migrations live in the @ats/db package (Phase 2); the
// shim at ./drizzle/schema.ts keeps the app's `@db/*` imports working.
export default defineConfig({
  dialect: "postgresql",
  schema: "../../packages/db/src/server/schema.ts",
  out: "../../packages/db/drizzle/pg-migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
