// @ats/storage/shared — browser-safe storage surface.
// Intentionally empty for now: every storage helper (S3 client or local
// fallback) is server-only — credentials and the local `.local-storage`
// root must never reach the client bundle. A shared surface (e.g. key
// helpers reused by upload UIs) arrives in a later slice.
export {};
