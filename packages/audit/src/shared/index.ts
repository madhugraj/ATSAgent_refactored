// @ats/audit/shared — browser-safe surface of the audit package.
// Intentionally empty for now: writeAudit appends to the audit_log table and
// redactEmail only runs server-side next to it, so nothing is exported here
// yet. A shared surface (e.g. audit display types for admin UIs) arrives in a
// later slice.
export {};
