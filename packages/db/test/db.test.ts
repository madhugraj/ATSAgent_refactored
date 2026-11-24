/**
 * Smoke test for the @ats/db client (map §4 L0 db row): the server-only
 * handle opens against DATABASE_URL, answers a trivial query, and closes.
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test packages/db/test/
 */
import { describe, expect, test } from "bun:test";
import { db, sql } from "@ats/db/server";

describe("@ats/db client", () => {
  test("opens the client against DATABASE_URL, selects 1, closes", async () => {
    const rows = await sql`select 1 as one`;
    expect(rows[0]?.["one"]).toBe(1);
    // The drizzle handle wraps the same postgres client.
    expect(typeof db.select).toBe("function");
    await sql.end({ timeout: 5 });
  });
});
