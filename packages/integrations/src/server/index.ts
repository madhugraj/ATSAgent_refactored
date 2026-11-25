import "@tanstack/react-start/server-only";

// @ats/integrations/server — meetings/LinkedIn/calendar provider clients.
// Uses the generic credential store (readSecrets/writeSecrets) from
// @ats/org/server directly (map §11 ruling 5's preferred path; the temporary
// integrations↔web readSecrets cycle never existed on main).
//
// PIN: linkedin.server and meetings-oauth.server both export `exchangeCode`.
// The LinkedIn callback route consumes linkedin's (TokenSet-returning)
// exchangeCode, so this index exports that one explicitly — two bare
// `export *` lines would silently drop the name and break that route.
// meetings-oauth's exchangeCode stays internal to its module (used by
// finishProviderConnect) and is not re-exported.
export { exchangeCode } from "./linkedin.server";
export * from "./linkedin.server";
export * from "./meetings.server";
export * from "./meetings-oauth.server";
export * from "./meeting-transcripts.server";
export * from "./calendar-availability.server";
export * from "./meeting-link.server";
