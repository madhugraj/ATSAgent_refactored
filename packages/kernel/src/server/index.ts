import "@tanstack/react-start/server-only";

// Load-once assertion (map §5 rule 10): this package must resolve to exactly
// one copy per bundle — the agent-event hook registry, the tool registry
// (with the gate refusal list) and the autonomy policy live here, and a
// second module copy would split them so registered hooks and tools would
// silently miss events. A module-level symbol on globalThis makes a
// duplicated bundler copy fail loudly at boot instead.
const globalForAts = globalThis as typeof globalThis & {
  __atsPackageInstances?: Record<string, symbol>;
};
if (globalForAts.__atsPackageInstances?.["kernel"]) {
  throw new Error(
    "[ats] @ats/kernel loaded twice in one runtime — a duplicated module copy would split the agent hook/tool registries (map §5 rule 10). Fix the bundler resolve/dedupe config.",
  );
}
(globalForAts.__atsPackageInstances ??= {})["kernel"] = Symbol("ats.kernel");

export * from "./events";
export * from "./policy";
export * from "./registry";
export * from "./manifest.server";
export * from "./task-liveness";
export * from "./hitl";
export * from "./run-messages";
export * from "./ports";
