/**
 * Effects the desk-core store needs from the app's agent runtime (map §4 L2:
 * an L2 package never imports the L4 agents package). The composition root
 * (apps/web/src/boot.ts) registers the real runtime functions here; deleting
 * a thread stops its runs and closes stale requests through exactly the same
 * calls as before the extraction. Without a registration (worker runtimes,
 * tests that do not opt in) the effects are skipped — the same "not
 * available in this runtime" contract as @ats/observability's mailer.
 */
export type DeskThreadEffects = {
  /** Stop one agent run and close its open tasks (runtime.cancelRun). */
  cancelRun: (input: { orgId: string; runId: string; userId: string }) => Promise<unknown>;
  /** Close open requests records an agent may be working on are gone (runtime.afterSubjectsDeleted). */
  afterSubjectsDeleted: (orgId: string) => Promise<void>;
};

let effects: DeskThreadEffects | null = null;

/** Register the app's agent-runtime effects (apps/web/src/boot.ts); null unregisters. */
export function registerDeskThreadEffects(fx: DeskThreadEffects | null): void {
  effects = fx;
}

/** The registered effects, or null before boot ran (callers must not assume one). */
export function deskThreadEffects(): DeskThreadEffects | null {
  return effects;
}
