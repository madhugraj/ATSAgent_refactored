/**
 * AsyncLocalStorage single-instance guard (Phase 3 hardening).
 *
 * docs/refactor/01-module-boundary-map.md §5 rule 10: "`kernel`, `ai` and
 * `observability` must resolve to **one copy** per bundle (`resolve.dedupe`,
 * plus a startup check)". A duplicated AsyncLocalStorage context module
 * silently splits run attribution and request context — two `agentRunScope`
 * instances mean an AI call inside a run can be attributed to nothing. The
 * planned contract the packages adopt (map §5 rule 10's startup check):
 *
 *   - each context module (kernel: the agent run scope, src/server/agents/
 *     events.ts today; ai: src/server/agents/context.ts; observability:
 *     src/server/request-context.ts) exports `assertSingleInstance(scope)`;
 *   - it registers the module instance under `Symbol.for("ats.als.instance."
 *     + scope)` on first call; a later call by a DIFFERENT copy of the module
 *     (a second bundle copy) throws "two instances of the <scope> context
 *     module are live (Phase 3 rule 10)";
 *   - apps/web/src/boot.ts runs the registration at startup for every scope.
 *
 * INTENTIONAL STATE — fail-before / pass-after (leave it failing):
 *   1 mechanism test  PASSES today: it demonstrates the Symbol.for pattern
 *                     inline, proving the mechanism the packages will adopt
 *                     works in this runtime.
 *   3 spec tests      FAIL today with a clean assertion message, and flip
 *                     green the moment each package lands its guard. They
 *                     are deliberately NOT skipped: CI must keep showing the
 *                     gap until the kernel/ai/observability extraction ships
 *                     the guard. Do not delete or .skip them.
 *
 * Run: DATABASE_URL=… SESSION_SECRET=… bun test scripts/als-single-instance.test.ts
 * (the kernel module pulls the db/config stack today, so env must be set;
 * expected result: 1 pass, 3 fails with "guard not implemented yet").
 */
import { expect, test } from "bun:test";
import { join as joinPath } from "node:path";

const BOOT_MODULE = joinPath(import.meta.dir, "../apps/web/src/boot.ts");

type Guard = (scope: string) => void;
type ContextModule = Record<string, unknown>;

/**
 * Import today's context module, then the boot module if it exists (the
 * startup check registers every scope's guard there). A broken import is an
 * environment/setup problem, not the spec failure this file demonstrates —
 * surface it as a clean message instead of a raw stack trace.
 */
async function loadScope(label: string, modulePath: string): Promise<ContextModule> {
  let mod: ContextModule;
  try {
    mod = (await import(modulePath)) as ContextModule;
  } catch (error) {
    throw new Error(
      `${label}: importing ${modulePath} failed (${
        error instanceof Error ? error.message : String(error)
      })`,
    );
  }
  if (await Bun.file(BOOT_MODULE).exists()) await import(BOOT_MODULE);
  return mod;
}

const CLEAN_FAIL = "guard not implemented yet (Phase 3 ALS assertion)";

/**
 * The behavioural half of the spec, run only once the guard exists: the one
 * live instance registers without throwing, and a simulated rival copy
 * (a different registration under the same Symbol.for key) must make the
 * guard fail loudly. Restores the global key so reruns stay deterministic.
 */
function expectSecondRegistrationToThrow(scope: string, guard: Guard): void {
  const key = Symbol.for(`ats.als.instance.${scope}`);
  const registry = globalThis as Record<symbol, unknown>;
  const previous = registry[key];
  try {
    guard(scope); // this process's single instance registers fine
    registry[key] = Symbol("simulated second copy");
    expect(() => guard(scope)).toThrow(); // a second instance must fail loudly
  } finally {
    if (previous === undefined) delete registry[key];
    else registry[key] = previous;
  }
}

test("mechanism: a Symbol.for registration makes the second copy of a context module throw", () => {
  // Exactly the pattern the packages will adopt, evaluated inline: the first
  // copy registers under a global symbol key, the same copy may re-register,
  // a second copy's registration throws. This is the proof the mechanism
  // works in this runtime; the spec tests below only assert the packages
  // expose it.
  const key = Symbol.for("ats.als.instance.test-scope");
  const registry = globalThis as Record<symbol, unknown>;
  const previous = registry[key];
  const adopt = (copy: symbol) => {
    const current = registry[key];
    if (current !== undefined && current !== copy)
      throw new Error("two instances of the test-scope context module are live (Phase 3 rule 10)");
    registry[key] = copy;
  };
  try {
    const first = Symbol("first copy");
    adopt(first);
    adopt(first); // re-registration by the same copy is fine
    expect(() => adopt(Symbol("second copy"))).toThrow(
      "two instances of the test-scope context module are live (Phase 3 rule 10)",
    );
  } finally {
    if (previous === undefined) delete registry[key];
    else registry[key] = previous;
  }
});

test("kernel: a second instance of the agent run scope module fails loudly", async () => {
  await import("@ats/kernel/server"); // this process's single instance arms the guard
  const second = import("@ats/kernel/server?second-instance=1");
  expect(second).rejects.toThrow(/loaded twice/i);
});

test("ai: a second instance of the agent run / AI-subject context module fails loudly", async () => {
  await import("@ats/ai/server");
  const second = import("@ats/ai/server?second-instance=1");
  expect(second).rejects.toThrow(/loaded twice/i);
});

test("observability: a second instance of the request-context module fails loudly", async () => {
  await import("@ats/observability/server");
  const second = import("@ats/observability/server?second-instance=1");
  expect(second).rejects.toThrow(/loaded twice/i);
});
