/**
 * 429 burst on POST /api/internal/ai (refactor plan Phase 9 rule 8: the
 * internal TS endpoints are covered by the limiter). The internal prefix is
 * limited like the public paths — 60/min per caller per path
 * (apps/web/src/server.ts isInternalApiPath → allowRequest).
 *
 * The SSR entry is stubbed so a request that passes the limiter is a plain
 * 200 and a throttled one is the shared 429 response; the in-memory store is
 * used (no database). Lives in its own file so the server-entry mock does not
 * clash with other suites in one bun process.
 * Run: DATABASE_URL=... SESSION_SECRET=... bun test scripts/internal-ai-rate-limit.test.ts
 */
import { describe, expect, mock, test } from "bun:test";

const { RATE_LIMIT } = await import("../apps/web/src/server/rate-limit");

mock.module("@tanstack/react-start/server-entry", () => ({
  default: { fetch: async () => new Response("handled") },
}));

const server = (await import("../apps/web/src/server")).default as {
  fetch: (request: Request) => Promise<Response>;
};

const post = (ip: string) =>
  server.fetch(
    new Request("http://localhost/api/internal/ai", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: JSON.stringify({ feature: "candidate_score", input: {} }),
    }),
  );

describe("internal AI callback burst (server dispatch)", () => {
  test(`allows ${RATE_LIMIT} a minute per caller, then 429; another caller is unaffected`, async () => {
    const ip = `10.42.0.${(process.pid % 200) + 10}`;
    for (let i = 0; i < RATE_LIMIT; i++) {
      const res = await post(ip);
      expect(res.status).not.toBe(429);
    }
    const burst = await post(ip);
    expect(burst.status).toBe(429);
    expect(burst.headers.get("retry-after")).toBe("60");

    const other = await post("10.42.99.99"); // different caller: own budget
    expect(other.status).toBe(200);
  });
});
