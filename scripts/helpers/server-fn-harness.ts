/**
 * Server-function test harness (shared — import this; never copy-paste).
 *
 * Mirrors what @tanstack/react-start 1.169.4's compiler does to provider
 * files: each `.handler(fn)` becomes `.handler(extractedFn, serverFn)`, and
 * `__executeServer` runs the middleware chain + handler in-process. If a
 * Start upgrade changes those internals, the harness self-test
 * (scripts/server-fn-harness.test.ts) fails loudly — fix here, not in suites.
 *
 * Also runs a callback inside both Start runtimes a server function reads:
 * the request AsyncLocalStorage (`tanstack-start:event-storage`, where
 * requireIdentity reads the session cookie) and the start context.
 */
import { readFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { AsyncLocalStorage } from "node:async_hooks";

/** Duplicate each `.handler(fn)` argument, exactly what the Start compiler
 *  does: `.handler(extractedFn, serverFn)`. Balances parens across strings
 *  and comments so multi-line handlers survive. */
export function addServerFnArg(src: string): string {
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

export type ExecutableServerFn = {
  __executeServer: (opts: { data: unknown; context?: unknown }) => Promise<{
    result?: unknown;
    error?: unknown;
  }>;
};

/** Write a patched copy of a server-fn module next to itself and import it.
 *  Returns the module plus a cleanup that removes the temp copy — call it in
 *  afterAll. The copy sits beside the original so its relative imports
 *  resolve exactly as in production. */
export async function createExecutableServerFn(sourceUrl: URL): Promise<{
  module: Record<string, unknown>;
  cleanup: () => Promise<void>;
}> {
  const patchedPath = sourceUrl.pathname.replace(/\.ts$/, ".scope-test.tmp.ts");
  await Bun.write(patchedPath, addServerFnArg(await readFile(sourceUrl, "utf8")));
  const module = (await import(pathToFileURL(patchedPath).pathname)) as Record<string, unknown>;
  return {
    module,
    cleanup: () => rm(patchedPath, { force: true }),
  };
}

/** Run `fn` as a request carrying the given session cookie, inside both Start
 *  runtimes a server function's middleware reads. */
export async function runWithSessionCookie<T>(token: string, fn: () => Promise<T>): Promise<T> {
  const request = new Request("http://127.0.0.1:3000/_server", {
    method: "POST",
    headers: { cookie: token },
  });
  const eventStorage = (
    globalThis as unknown as Record<symbol, AsyncLocalStorage<{ request: Request }> | undefined>
  )[Symbol.for("tanstack-start:event-storage")];
  if (!eventStorage) throw new Error("Start event storage is not initialised");
  const { runWithStartContext } = await import("@tanstack/start-storage-context");
  return runWithStartContext({ contextAfterGlobalMiddlewares: {} }, () =>
    eventStorage.run({ request }, fn),
  );
}

/** Execute an executable server function's middleware chain + handler as the
 *  given session's user. Middleware failures come back as { error }, not
 *  throws — rethrown here so callers assert on real errors. */
export async function executeAsUser(
  fn: ExecutableServerFn,
  sessionCookie: string,
  data: unknown,
): Promise<unknown> {
  return runWithSessionCookie(sessionCookie, async () => {
    const res = await fn.__executeServer({ data, context: {} });
    if (res && "error" in res && res.error) throw res.error;
    return res?.result;
  });
}
