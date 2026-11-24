// @ats/platform-http/shared — browser-safe surface of the HTTP platform package.
// Intentionally empty for now: everything here guards or shapes server
// requests (rate limiting, CSRF, security headers, metrics), which only ever
// runs server-side next to the fetch handler, so nothing is exported here
// yet. A shared surface (e.g. a client-visible rate-limit error shape)
// arrives in a later slice.
export {};
