import "@tanstack/react-start/server-only";

// Load-once assertion (map §5 rule 10): this package must resolve to exactly
// one copy per bundle — the agent-run and AI-subject AsyncLocalStorage
// contexts (context.ts) live here, and a second module copy would create
// fresh storages so run attribution in the ai_usage_events ledger would
// silently go blank. A module-level symbol on globalThis makes a duplicated
// bundler copy fail loudly at boot instead.
const globalForAts = globalThis as typeof globalThis & {
  __atsPackageInstances?: Record<string, symbol>;
};
if (globalForAts.__atsPackageInstances?.["ai"]) {
  throw new Error(
    "[ats] @ats/ai loaded twice in one runtime — a duplicated module copy would split the run/AI-subject AsyncLocalStorage contexts (map §5 rule 10). Fix the bundler resolve/dedupe config.",
  );
}
(globalForAts.__atsPackageInstances ??= {})["ai"] = Symbol("ats.ai");

export * from "./ai-gateway.server";
export * from "./ai-usage";
export * from "./ai-pricing";
export * from "./ai-spend-cap";
export * from "./prompt-echo";
export * from "./context";
export * from "./injection";
export * from "./training/capture.server";
export * from "./training/pseudonymise";
export * from "./redteam/check.server";
export * from "./redteam/probes";
