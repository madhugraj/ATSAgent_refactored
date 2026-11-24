import "@tanstack/react-start/server-only";

// Load-once assertion (map §5 rule 10): this package must resolve to exactly
// one copy per bundle — the per-request trace AsyncLocalStorage
// (request-context.ts) lives here, and a second module copy would create a
// fresh storage so log lines and response trace headers would silently lose
// the request's trace. A module-level symbol on globalThis makes a
// duplicated bundler copy fail loudly at boot instead.
const globalForAts = globalThis as typeof globalThis & {
  __atsPackageInstances?: Record<string, symbol>;
};
if (globalForAts.__atsPackageInstances?.["observability"]) {
  throw new Error(
    "[ats] @ats/observability loaded twice in one runtime — a duplicated module copy would split the per-request AsyncLocalStorage trace (map §5 rule 10). Fix the bundler resolve/dedupe config.",
  );
}
(globalForAts.__atsPackageInstances ??= {})["observability"] = Symbol("ats.observability");

export * from "./log";
export * from "./request-context";
export * from "./http-metrics";
export * from "./slo";
export * from "./slo.server";
export * from "./alerts.server";
export * from "./voice/debug";
export * from "./error-capture";
