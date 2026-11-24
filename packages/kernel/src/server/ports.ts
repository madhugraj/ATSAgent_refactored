/**
 * Ports the kernel exposes to the rest of the system (map §4 L1, §5). The
 * kernel holds only the registration API — the implementations live in the
 * higher layers and register in the composition root (apps/web/src/boot.ts):
 * no package may import the agents runtime to reach them.
 */
import type { AgentType } from "@ats/db/server";

/**
 * The agents' entry points, seen from the domains. The names mirror the
 * runtime functions they stand for (kickAgents, startRun,
 * cancelStaleRequests, afterSubjectsDeleted) so the agents package can
 * implement the port without adapting anything.
 */
export type AgentPort = {
  /** Start a run a domain asked for (runtime.startRun). */
  enqueue: (input: {
    orgId: string;
    agentType: AgentType;
    principalUserId: string;
    goal: string;
    subjectType?: string | null;
    subjectId?: string | null;
    triggerEventId?: string | null;
    maxSteps?: number;
    /** Hiring-desk thread; defaults to the thread of the subject's requisition. */
    conversationId?: string | null;
  }) => Promise<{ runId: string }>;
  /** Close open requests a stage change made pointless (runtime.cancelStaleRequests). */
  cancelStale: (
    orgId: string,
    applicationId: string,
    fromStage: string,
    toStage: string,
  ) => Promise<number>;
  /**
   * Call after deleting or erasing records an agent may be working on
   * (requisitions, applications, JDs, offers, candidates). Never fails the
   * deletion (runtime.afterSubjectsDeleted).
   */
  afterSubjectsDeleted: (orgId: string) => Promise<void>;
  /** Best-effort inline kick: drain this org's events and advance its runs now. */
  kick: (orgId: string) => void;
};

let agentPortImpl: AgentPort | null = null;

/** The composition root registers the implementation (boot.ts, later phase). */
export function registerAgentPort(port: AgentPort): void {
  agentPortImpl = port;
}

/** The registered port, or null before boot ran (domains must not assume one). */
export function agentPort(): AgentPort | null {
  return agentPortImpl;
}

/**
 * Domain events (map §5 "cross-cutting events"): a higher layer announces a
 * change ("stage.changed", "requisition.closed", …) and lower or sibling
 * packages react through handlers registered here, instead of importing up.
 */
export type DomainEvent = {
  orgId: string;
  type: string;
  payload?: Record<string, unknown>;
};
export type DomainEventHandler = (e: DomainEvent) => void | Promise<void>;

const domainHandlers: { type: string; handler: DomainEventHandler }[] = [];

/** Subscribe to a domain event by type; returns the unsubscribe function. */
export function onDomainEvent(type: string, handler: DomainEventHandler): () => void {
  const entry = { type, handler };
  domainHandlers.push(entry);
  return () => {
    const i = domainHandlers.indexOf(entry);
    if (i >= 0) domainHandlers.splice(i, 1);
  };
}

/** Handlers registered for a type, in registration order (its emitter reads this). */
export function domainEventHandlers(type: string): DomainEventHandler[] {
  return domainHandlers.filter((h) => h.type === type).map((h) => h.handler);
}

/**
 * "Records an agent may be working on were deleted or erased in this org"
 * (candidates erase, dedupe merge) — subscribers close the affected requests.
 */
export type SubjectsDeletedHandler = (orgId: string) => void | Promise<void>;

const subjectsHandlers: SubjectsDeletedHandler[] = [];

/** Subscribe to org-wide subject deletion; returns the unsubscribe function. */
export function onSubjectsDeleted(handler: SubjectsDeletedHandler): () => void {
  subjectsHandlers.push(handler);
  return () => {
    const i = subjectsHandlers.indexOf(handler);
    if (i >= 0) subjectsHandlers.splice(i, 1);
  };
}

/** Handlers in registration order (the eraser reads this). */
export function subjectsDeletedHandlers(): SubjectsDeletedHandler[] {
  return [...subjectsHandlers];
}
