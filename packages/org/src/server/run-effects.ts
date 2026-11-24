/**
 * Effects the org profile cores need from the app's agent runtime (map §4 L2:
 * this L2 package starts runs through the kernel AgentPort and never imports
 * the L4 agents runtime). The composition root (apps/web/src/boot.ts)
 * registers the real runtime.cancelRun here, so resetting a profile stops the
 * organisation's open org_context runs through exactly the same call as
 * before the move. Without a registration (worker runtimes, tests that do
 * not opt in) the effects are skipped — the same "not available in this
 * runtime" contract as @ats/desk-core's thread effects.
 */
export type OrgRunEffects = {
  /** Stop one agent run and close its open tasks (runtime.cancelRun). */
  cancelRun: (input: { orgId: string; runId: string; userId: string }) => Promise<unknown>;
};

let effects: OrgRunEffects | null = null;

/** Register the app's agent-runtime effects (apps/web/src/boot.ts); null unregisters. */
export function registerOrgRunEffects(fx: OrgRunEffects | null): void {
  effects = fx;
}

/** The registered effects, or null before boot ran (callers must not assume one). */
export function orgRunEffects(): OrgRunEffects | null {
  return effects;
}
