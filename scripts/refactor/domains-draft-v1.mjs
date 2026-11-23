// ordered rules: first match wins. Applies to src/lib & src/server & drizzle.
export const RULES = [
  ["db", /^drizzle\/|^src\/server\/db\.ts$|^src\/lib\/database\.types/],
  ["agents", /^src\/server\/agents\/|^src\/lib\/(agents|platform-agents|eval-catalog|panel-agent)/],
  ["voice", /^src\/server\/voice\/|^src\/lib\/(screening-calls|phone-screening)/],
  [
    "desk",
    /^src\/server\/desk\/|^src\/lib\/(hiring-desk|desk-view|copilot|user-manual|onboarding\.catalogue|manual-export|org-desk)/,
  ],
  [
    "distribution",
    /^src\/server\/(boards|distribution)\/|^src\/lib\/(distribution|boards|job-channels)/,
  ],
  [
    "ai",
    /^src\/lib\/(ai-gateway|ai-settings|prompt-echo|training\.functions|platform-ai-usage)|^src\/server\/(ai-|redteam\/|training\/)/,
  ],
  [
    "auth",
    /^src\/lib\/(auth\.|auth-client|step-up|password-policy|oauth-state|work-email)|^src\/server\/(password|step-up|identity|claims|action-token)/,
  ],
  ["comms", /^src\/lib\/(email-|notifications|nudges|local-inbox|templates|ics)/],
  [
    "interviews",
    /^src\/server\/panel\/|^src\/lib\/(interview|panel|slot-offers|calendar-availability|meeting|meetings|vtt|assessment|logistics|scorecard|screening-coverage)/,
  ],
  [
    "offers",
    /^src\/lib\/(offer|negotiation|compensation|comp-knowledge|salary-benchmark|market|hiring-cost|roi|cost-format|money)/,
  ],
  ["onboarding", /^src\/lib\/(onboarding|hrms|hr-performance|career|pre-onboard)/],
  [
    "matching",
    /^src\/lib\/(matching|screening|autoscore|bias|shortlist|verification|expert-brief)/,
  ],
  [
    "candidates",
    /^src\/server\/parser\/|^src\/lib\/(candidates|cv-|resume|dedupe|capture|collect|apply|linkedin|social|document-hidden-text|pool-share)/,
  ],
  [
    "requisitions",
    /^src\/lib\/(requisitions|intake|role-profile|role-hiring-manager|lifecycle|jd-dedupe|work-mode|stage-events|pipeline|shortlist)/,
  ],
  ["catalogue", /^src\/lib\/(catalogue|product-catalogue|legal\/|org-agreements)/],
  [
    "org",
    /^src\/lib\/(org|master|ontology|integrations|collaboration|queries|data\.ts)|^src\/server\/(org-|integration-seeds)/,
  ],
  ["platform-admin", /^src\/lib\/platform/],
  [
    "core",
    /^src\/server\/[^/]+$|^src\/lib\/(errors|error-|utils|local-time|public-paths|external-links|interview-with|meeting-ref|career-ladder)/,
  ],
  ["ui", /^src\/(components|routes|hooks|router|start|styles|routeTree|assets|stubs|types)/],
];
export const domainOf = (f) => (RULES.find(([, r]) => r.test(f)) || ["UNMAPPED"])[0];
