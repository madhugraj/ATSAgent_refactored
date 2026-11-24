// @ats/config/shared — browser-safe configuration surface.
// Intentionally empty for now: env validation is server-only (it reads
// process.env and holds secrets), so nothing is exported here yet. The
// shared surface (e.g. the public job-channel catalogue) arrives in a
// later slice of the Phase 2 config change PRs.
export {};
