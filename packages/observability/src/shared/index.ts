// @ats/observability/shared — browser-safe observability surface.
// Intentionally empty for now: logging, request correlation, metrics and SLO
// maths all live on the server entry (they read process.env or Node APIs, and
// the client bundle must never pull them in). A shared surface (e.g. the SLO
// ids/names for the Service health page) can move here in a later slice.
export {};
