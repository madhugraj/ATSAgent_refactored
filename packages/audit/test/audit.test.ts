/**
 * Test for @ats/audit writeAudit (map §4 L1 audit row): a write against the
 * real test database with a fake org context lands exactly one audit_log row,
 * and the fire-and-forget contract holds — a rejected insert must never throw
 * out of writeAudit (an audit failure must not break the action it audits).
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test packages/audit/test/
 */
import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auditLog, db, sql } from "@ats/db/server";
import { redactEmail, writeAudit } from "@ats/audit/server";

afterAll(async () => {
  await sql.end({ timeout: 5 });
});

describe("@ats/audit writeAudit", () => {
  test("lands exactly one audit_log row for a fake org context", async () => {
    // A fake org context: a random uuid with no organisations row. audit_log
    // carries no foreign key, so the trail accepts it and org scoping stays
    // with the callers (requireOrg) — same as production writes.
    const orgId = randomUUID();
    const entityId = randomUUID();
    // A unique action keeps the assertion scoped to exactly this write.
    const action = `test.audit.lands.${Date.now()}`;
    await writeAudit({
      actor: "user:test",
      orgId,
      action,
      entityType: "test_entity",
      entityId,
      detail: { source: "packages/audit/test" },
    });
    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, action)));
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.actor).toBe("user:test");
    expect(row.actorUserId).toBeNull();
    expect(row.entityType).toBe("test_entity");
    expect(row.entityId).toBe(entityId);
    expect(row.detail).toEqual({ source: "packages/audit/test" });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  test("swallows a rejected insert instead of throwing (fire-and-forget)", async () => {
    // "not-a-uuid" violates the entity_id uuid column, so Postgres rejects
    // the insert; writeAudit must still resolve.
    await expect(
      writeAudit({
        actor: "system",
        action: "test.audit.invalid-entity-id",
        entityId: "not-a-uuid",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("@ats/audit redactEmail", () => {
  test("keeps the domain, masks the local part, and handles junk input", () => {
    expect(redactEmail("alice@example.com")).toBe("***@example.com");
    expect(redactEmail("not-an-email")).toBe("(redacted)");
    expect(redactEmail(null)).toBe("(redacted)");
    expect(redactEmail(undefined)).toBe("(redacted)");
  });
});
