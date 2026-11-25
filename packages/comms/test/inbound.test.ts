/**
 * The comms inbound transport's no-handler path (reviewer, 2026-11-25):
 * with no handler registered, receiveMail must NOT silently skip — it logs
 * inbound.no_handler and returns an error result naming the wiring bug.
 * (The running product registers its handler in boot.ts / local-inbox.server;
 * this test exercises the standalone-transport shape.)
 * Run: DATABASE_URL=… SESSION_SECRET=… bun test packages/comms/test/inbound.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const { db } = await import("@ats/db/server");
const { organizations } = await import("@ats/db/server");
const comms = await import("../src/server/inbound.server");

const stamp = Date.now();
let orgId: string;

beforeAll(async () => {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");
  orgId = (
    await db
      .insert(organizations)
      .values({
        name: "Inbound Transport Org",
        slug: `inbt-${stamp}`,
        careersEmail: `jobs-${stamp}@example.com`,
        status: "active",
      })
      .returning({ id: organizations.id })
  )[0]!.id;
});

afterAll(async () => {
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("inbound transport: no handler registered", () => {
  test("is a loud error naming the wiring bug, not a silent skip", async () => {
    const res = await comms.receiveMail({
      to: `jobs-${stamp}@example.com`,
      from: "Asha Rao <asha@example.com>",
      subject: "Backend engineer application",
      text: "See attached CV",
    });
    expect(res.status).toBe("error");
    expect(res.detail).toBe("Inbound mail handler is not registered.");
    expect(res.messageId).toBe(null);
  });
});
