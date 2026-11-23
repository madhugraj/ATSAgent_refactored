// FINAL file -> package mapping (map §4, §10 rulings). Ordered rules: first
// match wins. Applies to everything under src/, drizzle/ and root scripts.
//
// Layer codes: L0 foundation · L1 platform · L2 shared services · L3 hiring
// domains · L4 orchestration · APP composition roots.
// `std` is the map §4 "shared utils (in config or a tiny std)" option,
// resolved to a tiny std package (see phase-log Phase 1 handoff).

// ---- §10 rulings encoded -------------------------------------------------
// pay-*/labour-policy/offer-check  -> offers policy/          (§10)
// workflow-templates, agent-intelligence/governance/reports/modality -> agents
// copilot server                   -> desk
// call-reviews                     -> voice
// hiring-sla, hiring-oversight     -> desk
// demand-outlook, pool-coverage    -> desk (writers: copilot/data.server, desk)
// iso/appearance/report-window     -> std (weight-advice -> matching, it
//                                     imports matching/weight types)
// src/server.ts, start.ts          -> apps/web composition root
// --------------------------------------------------------------------------

export const RULES = [
  // ---- APP composition roots and web-only code --------------------------
  ["web/src", /^src\/(components|routes|hooks|router|start|styles|routeTree|assets|stubs|types)/],
  ["web/server-fn", /^src\/lib\/.*\.functions\.ts$/],
  ["web/client", /^src\/lib\/(data\.ts|catalogue-export\.ts)/],
  ["web/entry", /^src\/(server\.ts|start\.ts|router\.tsx)$/],
  ["app/voice-worker", /^src\/server\/voice\/worker\.ts$/],
  ["app/parser-worker", /^src\/server\/parser\/(worker|sandbox)/],

  // ---- L0: foundation ---------------------------------------------------
  ["db", /^drizzle\/|^src\/server\/db\.ts$|^src\/lib\/database\.types/],
  ["config", /^src\/server\/env\.ts$/],
  [
    "std",
    /^src\/lib\/(utils|money|cost-format|local-time|errors|error-page|public-paths|external-links|iso|appearance|report-window|cv-text\.server|wall-date|zoned-time|job-channels|code-select|product-catalogue)/,
  ],
  [
    "observability",
    /^src\/server\/(log|request-context|http-metrics|slo)|^src\/lib\/error-capture|^src\/server\/agents\/alerts\.server/,
  ],
  ["security", /^src\/server\/(crypto|safe-fetch|client-ip)|^src\/lib\/document-hidden-text/],
  ["storage", /^src\/server\/storage\.ts$/],

  // ---- L1: platform -----------------------------------------------------
  ["audit", /^src\/server\/audit\.ts$/],
  [
    "auth",
    /^src\/server\/(identity|password|step-up|action-token|claims|oauth-state)\.ts|^src\/lib\/(auth\.|auth-client|step-up-client|password-policy|oauth-state|work-email)/,
  ],
  ["platform-http", /^src\/server\/(rate-limit|cron-auth)|^src\/server\/http\.ts/],
  [
    "ai",
    /^src\/lib\/(ai-gateway|ai-settings|prompt-echo)|^src\/server\/(ai-usage|ai-pricing|ai-spend-cap|ai-gateway)|^src\/server\/(training|redteam)\/|^src\/server\/agents\/(context|injection)\.ts/,
  ],
  [
    "kernel",
    /^src\/server\/agents\/(events|policy|registry|manifest\.server|task-liveness|hitl|run-messages)\.ts/,
  ],

  // ---- L2: shared business services -------------------------------------
  [
    "org",
    /^src\/lib\/(org|master|templates)|^src\/server\/(org-setup|integration-seeds|credentials)/,
  ],
  ["legal", /^src\/lib\/legal\/|^src\/(lib|server)\/org-agreements/],
  [
    "comms",
    /^src\/lib\/(email-templates|send-email|email-outbox|email-settings|email-brand|ics|local-inbox)|^src\/server\/email-brand/,
  ],
  [
    "integrations",
    /^src\/lib\/(meetings|meeting-transcripts|linkedin|calendar-availability)|^src\/server\/(meetings|linkedin)/,
  ],
  ["desk-core", /^src\/server\/desk\/conversation/],

  // ---- L3: hiring domains (in §4 order) ---------------------------------
  [
    "requisitions",
    /^src\/lib\/(requisitions|role-profile|role-hiring-manager|jd-dedupe|work-mode)|^src\/server\/guards\.ts/,
  ],
  [
    "candidates",
    /^src\/server\/(parser|erase\.server)|^src\/lib\/(candidates|intake|cv-|resume|dedupe|capture|collect|collaboration|queries|pool-share|social)/,
  ],
  ["pipeline", /^src\/lib\/(lifecycle|pipeline\.server|stage-events|assessment-timeline)/],
  [
    "matching",
    /^src\/lib\/(matching|screening|autoscore|bias|shortlist|verification|expert-brief|weight-advice|screening-coverage|logistics)/,
  ],
  [
    "interviews",
    /^src\/server\/panel\/|^src\/lib\/(interview|panel|slot-offers|vtt|assessment|scorecard-chase|panel-changes)/,
  ],
  [
    "offers",
    /^src\/lib\/(offer|negotiation|compensation|comp-knowledge|salary-benchmark|market\.|pay-|labour-policy)/,
  ],
  ["onboarding", /^src\/lib\/(onboarding|hrms)/],
  ["distribution", /^src\/server\/(boards|distribution)\/|^src\/lib\/(distribution|boards|apply)/],

  // ---- L4: orchestration and aggregation --------------------------------
  [
    "agents",
    /^src\/server\/agents\/|^src\/lib\/(agents\.catalog|eval-catalog|agent-|workflow-templates|platform-agent)/,
  ],
  [
    "desk",
    /^src\/server\/(desk|copilot\/|hiring-sla)|^src\/server\/desk\.server\.ts|^src\/lib\/(hiring-desk|desk-view|copilot|user-manual|onboarding\.catalogue|manual-export|org-desk|hiring-oversight|demand-outlook|pool-coverage)/,
  ],
  ["voice", /^src\/server\/voice\/|^src\/lib\/(screening-calls|phone-screening|call-reviews)/],
  ["analytics", /^src\/lib\/(roi|ontology\.|career|hr-performance|bias-report|reports)/],
  ["workspace", /^src\/lib\/(notifications|nudges)|^src\/lib\/platform/],

  // ---- catch-alls (must shrink to zero; inventory fails otherwise) ------
  ["org", /^src\/server\/org-|^src\/lib\/integrations/],
  ["std", /^src\/lib\/(interview-with|meeting-ref|career-ladder)/],
];

export const domainOf = (f) => (RULES.find(([, r]) => r.test(f)) || ["UNMAPPED"])[0];

/**
 * Entry point per file: shared (browser-safe), server (server-only), web
 * (UI/composition), app (worker entry). Heuristic the inventory tool uses:
 * `.functions.ts` and UI dirs are web; `*.server.ts` and server/ dirs are
 * server; workers are app; everything else shared unless it imports
 * node:/db/server-only (checked by inventory.mjs, refined per package).
 */
export const entryOf = (f) => {
  if (/\.functions\.ts$/.test(f)) return "web";
  if (/^src\/(components|routes|hooks|router|styles|assets)/.test(f)) return "web";
  if (/^src\/(server\.ts|start\.ts)$/.test(f)) return "web";
  if (/worker\.ts$/.test(f)) return "app";
  if (/(^|\/)server\//.test(f) || /\.server\.ts$/.test(f)) return "server";
  return "shared";
};
