// @ats/ai/shared — browser-safe AI surface.
// Intentionally empty for now: the gateway, its ledger and AI_FEATURES, prompt
// defences and the run scopes are all server-only (they hold credentials,
// vendor names and per-tenant state, and the client bundle must never pull
// them in — AGENTS.md). A shared surface (e.g. ledger feature slugs for UI
// grouping) can move here in a later slice.
export {};
