// Idempotent SQL migration runner for the @ats/db package's drizzle/pg-migrations.
// Usage: DATABASE_URL=postgres://... node packages/db/scripts/migrate-pg.mjs
// Applies every not-yet-recorded *.sql file in filename order and records it
// in a `pg_migrations` table. Safe to re-run; safe to run in CI.
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

// Resolved from this script (the package root), not cwd: CI and local-db.sh
// both run it from the repo root, drizzle-kit from apps/web.
const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "drizzle", "pg-migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
if (!files.length) {
  console.error(`no .sql files found in ${dir}`);
  process.exit(1);
}

const sql = postgres(url, { max: 1 });

await sql`create table if not exists pg_migrations (name text primary key, applied_at timestamptz not null default now())`;
const applied = new Set((await sql`select name from pg_migrations`).map((r) => r.name));

let ran = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const content = readFileSync(join(dir, file), "utf8");
  process.stdout.write(`applying ${file} ... `);
  try {
    await sql.unsafe(content);
    await sql`insert into pg_migrations (name) values (${file})`;
    console.log("ok");
    ran++;
  } catch (err) {
    console.log("FAILED");
    console.error(err.message);
    console.error(`stopped before ${file}; fix and re-run (already-applied files are skipped)`);
    process.exit(1);
  }
}

console.log(ran === 0 ? "database is up to date" : `applied ${ran} migration(s)`);
await sql.end();
