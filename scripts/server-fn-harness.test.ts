/**
 * Self-test for the shared server-fn harness
 * (scripts/helpers/server-fn-harness.ts — mirrors @tanstack/react-start
 * 1.169.4's compiler transform + Start runtimes). If a Start upgrade changes
 * those internals, THIS test fails loudly: upgrade-time breakage shows up as
 * one red file, not as silently-passing suites everywhere.
 *
 * Proven through the real respondReferral server function:
 *  - a bad session cookie is REFUSED by requireIdentity (middleware chain
 *    genuinely runs), and
 *  - a valid session cookie is ACCEPTED (the handler itself executes —
 *    "That referral no longer exists." is a handler-level outcome, past auth).
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test scripts/server-fn-harness.test.ts
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

const { db } = await import("../apps/web/src/server/db");
const { users } = await import("../apps/web/drizzle/schema");
const { createSession, SESSION_COOKIE } = await import("../apps/web/src/server/identity");
const harness = await import("./helpers/server-fn-harness");

const stamp = Date.now();
let userId: string;
let validCookie: string;
const { module: collaboration, cleanup } = await harness.createExecutableServerFn(
  new URL("../apps/web/src/lib/collaboration.functions.ts", import.meta.url),
);
const respondReferral = collaboration.respondReferral as never;

beforeEach(async () => {
  if (!userId) {
    userId = (
      await db
        .insert(users)
        .values({ email: `harness-${stamp}@e.com` })
        .returning({ id: users.id })
    )[0]!.id;
    validCookie = `${SESSION_COOKIE}=${await createSession(userId)}`;
  }
});

afterAll(async () => {
  await cleanup();
  // Deleting the user cascades the session the valid-cookie case used.
  await db.delete(users).where(eq(users.id, userId));
});

describe("server-fn harness self-test (Start internals guard)", () => {
  test("an absent session cookie is refused by the middleware chain", async () => {
    await expect(
      harness.executeAsUser(respondReferral, "", {
        referralId: crypto.randomUUID(),
        accept: true,
      }),
    ).rejects.toThrow(/authorization/i);
  });

  test("a garbage session cookie is refused by the middleware chain", async () => {
    await expect(
      harness.executeAsUser(respondReferral, `${SESSION_COOKIE}=garbage-${stamp}`, {
        referralId: crypto.randomUUID(),
        accept: true,
      }),
    ).rejects.toThrow(/authorization|session/i);
  });

  test("a valid session cookie is accepted and the handler itself runs", async () => {
    // A handler-level outcome ("That referral no longer exists.") proves the
    // chain went authn → validator → handler; an auth failure would say
    // "Unauthorized" instead.
    await expect(
      harness.executeAsUser(respondReferral, validCookie, {
        referralId: crypto.randomUUID(),
        accept: true,
      }),
    ).rejects.toThrow("That referral no longer exists.");
  });
});
