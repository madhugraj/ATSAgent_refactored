// SHIM: remove in Phase 8
// The integration catalogue and tenant seeding live in @ats/org/server
// (Phase 4, map §4 L2).
export type { SeedIntegration } from "@ats/org/server";
export { INTEGRATION_CATALOG, seedSourceIntegrations } from "@ats/org/server";
