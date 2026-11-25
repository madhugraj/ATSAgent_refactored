/**
 * Org-scope of respondReferral's existing-application check, against the
 * disposable database:
 *  - a second org's application for the same (candidateId, requisitionId) pair
 *    does not suppress the accept path — the referral's org still gets its
 *    `internal_referral` application (the pre-check carries the referral's
 *    org_id, per the AGENTS.md rule that every query has an explicit org
 *    predicate);
 *  - the same org's application for the pair still suppresses the duplicate.
 *
 * The `applications_requisition_candidate_key` unique index makes a cross-org
 * duplicate pair impossible in a healthy database (which is why the missing
 * predicate was unexploitable), so the suite drops that index for the run —
 * the only way to seed the scenario the predicate guards against — and
 * restores it in afterAll once the duplicate-pair rows are gone.
 *
 * TanStack Start compiles `.handler(fn)` into `.handler(fn, fn)` (extracted
 * stub + server implementation); without that second argument the server
 * chain never reaches the handler. The loader below applies the same
 * transform to collaboration.functions.ts and imports the patched copy, so
 * the real respondReferral handler runs in-process through its real
 * requireIdentity middleware chain (session cookie resolved against the
 * sessions table).
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test scripts/collaboration-scope.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { readFile, rm } from "node:fs/promises";
import type { AsyncLocalStorage } from "node:async_hooks";

const SOURCE = new URL("../apps/web/src/lib/collaboration.functions.ts", import.meta.url).pathname;
const PATCHED = new URL(
  "../apps/web/src/lib/collaboration.functions.scope-test.tmp.ts",
  import.meta.url,
).pathname;

/** Duplicate each `.handler(fn)` argument, exactly what the Start compiler
 *  does for provider files: `.handler(extractedFn, serverFn)`. Balances
 *  parens across strings and comments so multi-line handlers survive. */
function addServerFnArg(src: string): string {
  const needle = ".handler(";
  let out = "";
  let i = 0;
  for (;;) {
    const at = src.indexOf(needle, i);
    if (at === -1) {
      out += src.slice(i);
      return out;
    }
    const argStart = at + needle.length;
    let depth = 1;
    let j = argStart;
    while (depth > 0 && j < src.length) {
      const c = src[j]!;
      // Comments before quotes: prose contains apostrophes.
      if (c === "/" && src[j + 1] === "/") {
        while (j < src.length && src[j] !== "\n") j++;
      } else if (c === "/" && src[j + 1] === "*") {
        j = src.indexOf("*/", j) + 1;
      } else if (c === '"' || c === "'" || c === "`") {
        const quote = c;
        j++;
        while (j < src.length && src[j] !== quote) {
          if (src[j] === "\\") j++;
          j++;
        }
      } else if (c === "(") depth++;
      else if (c === ")") depth--;
      j++;
    }
    const argEnd = j - 1;
    const inner = src.slice(argStart, argEnd);
    out += src.slice(i, argStart) + inner + ", " + inner + ")";
    i = argEnd + 1;
  }
}

const { db } = await import("../apps/web/src/server/db");
const {
  applications,
  candidateReferrals,
  candidates,
  orgMembers,
  organizations,
  requisitions,
  users,
} = await import("../apps/web/drizzle/schema");
const { createSession, SESSION_COOKIE } = await import("../apps/web/src/server/identity");

await Bun.write(PATCHED, addServerFnArg(await readFile(SOURCE, "utf8")));
const collaboration = await import(PATCHED);

/** __executeServer runs the middleware chain (authn, validator) and the
 *  handler in-process; middleware failures come back as { error }, not throws. */
const executeServer = (
  collaboration.respondReferral as unknown as {
    __executeServer: (opts: { data: unknown; context?: unknown }) => Promise<{
      result?: unknown;
      error?: unknown;
    }>;
  }
).__executeServer;

/** Run respondReferral as the given session's user. Both Start runtimes are
 *  faked: the request AsyncLocalStorage (whose store requireIdentity's
 *  getRequest reads the session cookie from) and the start context
 *  __executeServer itself reads. */
async function respondAs(token: string, referralId: string, accept: boolean) {
  const request = new Request("http://127.0.0.1:3000/_server", {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
  });
  const eventStorage = (
    globalThis as unknown as Record<symbol, AsyncLocalStorage<{ request: Request }> | undefined>
  )[Symbol.for("tanstack-start:event-storage")];
  if (!eventStorage) throw new Error("Start event storage is not initialised");
  const { runWithStartContext } = await import("@tanstack/start-storage-context");
  return runWithStartContext({ contextAfterGlobalMiddlewares: {} }, () =>
    eventStorage.run({ request }, async () => {
      const res = await executeServer({ data: { referralId, accept }, context: {} });
      if (res && "error" in res && res.error) throw res.error;
      return res?.result;
    }),
  );
}

const PAIR_INDEX = "applications_requisition_candidate_key";

const stamp = Date.now();
const domain = `cscope${stamp}.test`;
let orgAId: string;
let orgBId: string;
let recipientId: string;
let referrerId: string;
let candidateOneId: string;
let candidateTwoId: string;
let requisitionId: string;
let referralOneId: string;
let referralTwoId: string;
let orgBApplicationId: string;
let sessionToken: string;

beforeAll(async () => {
  const url = process.env.DATABASE_URL ?? "";
  if (!["127.0.0.1", "localhost", "::1"].includes(new URL(url).hostname))
    throw new Error("Refusing non-local database");

  // The cross-org duplicate this suite seeds is exactly what the pair's unique
  // index forbids; lift it for the run so the guard can be exercised, and
  // restore it in afterAll once the duplicate rows are gone.
  await db.execute(sql.raw(`DROP INDEX IF EXISTS ${PAIR_INDEX}`));

  orgAId = (
    await db
      .insert(organizations)
      .values({ name: "Scope Org A", slug: `cscope-a-${stamp}`, status: "active" })
      .returning({ id: organizations.id })
  )[0]!.id;
  orgBId = (
    await db
      .insert(organizations)
      .values({ name: "Scope Org B", slug: `cscope-b-${stamp}`, status: "active" })
      .returning({ id: organizations.id })
  )[0]!.id;

  const mkUser = async (local: string) =>
    (
      await db
        .insert(users)
        .values({ email: `${local}@${domain}` })
        .returning({ id: users.id })
    )[0]!.id;
  recipientId = await mkUser("recipient");
  referrerId = await mkUser("referrer");
  await db.insert(orgMembers).values([
    { orgId: orgAId, userId: recipientId, email: `recipient@${domain}`, status: "active" },
    { orgId: orgAId, userId: referrerId, email: `referrer@${domain}`, status: "active" },
  ] as never);

  const mkCandidate = async (name: string, local: string) =>
    (
      await db
        .insert(candidates)
        .values({
          orgId: orgAId,
          fullName: name,
          email: `${local}@${domain}`,
          experienceYears: "8",
          skills: ["LLMs"],
        } as never)
        .returning({ id: candidates.id })
    )[0]!.id;
  candidateOneId = await mkCandidate("Asha Referred", "asha");
  candidateTwoId = await mkCandidate("Rohan Referred", "rohan");

  requisitionId = (
    await db
      .insert(requisitions)
      .values({
        orgId: orgAId,
        code: `REQ-CS-${stamp}`,
        title: "Head of AI",
        status: "approved",
        createdBy: referrerId,
      } as never)
      .returning({ id: requisitions.id })
  )[0]!.id;

  // Org B already holds an application for the same (candidate, requisition)
  // pair the org A referral would create.
  orgBApplicationId = (
    await db
      .insert(applications)
      .values({
        orgId: orgBId,
        requisitionId,
        candidateId: candidateOneId,
        stage: "sourced",
        source: "job_board",
      } as never)
      .returning({ id: applications.id })
  )[0]!.id;

  referralOneId = (
    await db
      .insert(candidateReferrals)
      .values({
        orgId: orgAId,
        candidateId: candidateOneId,
        requisitionId,
        fromUser: referrerId,
        toUser: recipientId,
        status: "pending",
      })
      .returning({ id: candidateReferrals.id })
  )[0]!.id;

  // Control: the recipient's own org already has the pair — a duplicate must
  // still be suppressed.
  await db.insert(applications).values({
    orgId: orgAId,
    requisitionId,
    candidateId: candidateTwoId,
    stage: "sourced",
    source: "direct",
  } as never);
  referralTwoId = (
    await db
      .insert(candidateReferrals)
      .values({
        orgId: orgAId,
        candidateId: candidateTwoId,
        requisitionId,
        fromUser: referrerId,
        toUser: recipientId,
        status: "pending",
      })
      .returning({ id: candidateReferrals.id })
  )[0]!.id;

  sessionToken = await createSession(recipientId);
});

afterAll(async () => {
  // Candidate deletion cascades the applications (both orgs) and the
  // ownership events; the referrals reference the organisation directly.
  if (orgAId) await db.delete(candidateReferrals).where(eq(candidateReferrals.orgId, orgAId));
  if (candidateOneId) await db.delete(candidates).where(eq(candidates.id, candidateOneId));
  if (candidateTwoId) await db.delete(candidates).where(eq(candidates.id, candidateTwoId));
  for (const id of [orgAId, orgBId])
    if (id) await db.delete(organizations).where(eq(organizations.id, id));
  for (const id of [recipientId, referrerId])
    if (id) await db.delete(users).where(eq(users.id, id));
  // Only safe once the duplicate-pair rows above are gone.
  await db.execute(sql.raw(`DROP INDEX IF EXISTS ${PAIR_INDEX}`));
  await db.execute(
    sql.raw(
      `CREATE UNIQUE INDEX IF NOT EXISTS ${PAIR_INDEX} ON applications (requisition_id, candidate_id)`,
    ),
  );
  await rm(PATCHED, { force: true });
});

describe("respondReferral org scope", () => {
  test("another org's application for the pair does not suppress the insert", async () => {
    const before = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.candidateId, candidateOneId),
          eq(applications.requisitionId, requisitionId),
        ),
      );
    expect(before.map((r) => r.id)).toEqual([orgBApplicationId]);

    const res = await respondAs(sessionToken, referralOneId, true);
    expect(res).toMatchObject({ ok: true, accepted: true });

    const [referral] = await db
      .select({ status: candidateReferrals.status })
      .from(candidateReferrals)
      .where(eq(candidateReferrals.id, referralOneId));
    expect(referral!.status).toBe("accepted");

    const rows = await db
      .select({ orgId: applications.orgId, stage: applications.stage, source: applications.source })
      .from(applications)
      .where(
        and(
          eq(applications.candidateId, candidateOneId),
          eq(applications.requisitionId, requisitionId),
        ),
      );
    // The unscoped pre-check would have seen org B's row and skipped the
    // insert; org A must have its own internal_referral application.
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({
      orgId: orgAId,
      stage: "sourced",
      source: "internal_referral",
    });
    expect(rows).toContainEqual({ orgId: orgBId, stage: "sourced", source: "job_board" });
  });

  test("the referral's own org still suppresses a duplicate pair", async () => {
    const res = await respondAs(sessionToken, referralTwoId, true);
    expect(res).toMatchObject({ ok: true, accepted: true });

    const rows = await db
      .select({ id: applications.id })
      .from(applications)
      .where(
        and(
          eq(applications.candidateId, candidateTwoId),
          eq(applications.requisitionId, requisitionId),
        ),
      );
    expect(rows).toHaveLength(1);

    const [referral] = await db
      .select({ status: candidateReferrals.status })
      .from(candidateReferrals)
      .where(eq(candidateReferrals.id, referralTwoId));
    expect(referral!.status).toBe("accepted");
  });
});
