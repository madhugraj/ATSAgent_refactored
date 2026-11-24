/**
 * Request rate limiting (src/server/rate-limit.ts, docs/guardrails.md P2-2):
 * the per-instance window, the sliding estimate, and the shared Postgres store
 * enforcing ONE limit across two separate processes (two "instances").
 * Run: DATABASE_URL=... SESSION_SECRET=... bun test scripts/rate-limit.test.ts
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const { allowInMemory, allowRequest, slidingCount, RATE_LIMIT } =
  await import("../apps/web/src/server/rate-limit");
const { sql } = await import("../apps/web/src/server/db");

const stamp = Date.now();

afterAll(async () => {
  await sql`delete from rate_limit_hits where key like ${`rl-test-${stamp}%`}`;
});

describe("per-instance window", () => {
  test(`allows ${RATE_LIMIT} a minute, then refuses; a minute later allows again`, () => {
    const key = `mem-${stamp}`;
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMIT; i++) expect(allowInMemory(key, t0 + i)).toBe(true);
    expect(allowInMemory(key, t0 + RATE_LIMIT)).toBe(false);
    expect(allowInMemory(key, t0 + 60_001 + RATE_LIMIT)).toBe(true);
  });
});

describe("sliding estimate", () => {
  test("the previous window fades out across the current one", () => {
    expect(slidingCount(60, 0, 0)).toBe(60);
    expect(slidingCount(60, 10, 0.5)).toBe(40);
    expect(slidingCount(60, 10, 1)).toBe(10);
  });
});

describe("shared store (RATE_LIMIT_STORE=postgres)", () => {
  test("two processes share one limit for the same caller", async () => {
    process.env["RATE_LIMIT_STORE"] = "postgres";
    const key = `rl-test-${stamp}-shared`;
    // Pin `now` to the start of a window so the previous window weighs fully
    // and nothing from it exists: the limit is exactly RATE_LIMIT.
    const now = Math.ceil(Date.now() / 60_000) * 60_000 + 5;
    let allowedHere = 0;
    for (let i = 0; i < 40; i++) if (await allowRequest(key, now)) allowedHere++;
    // A second, separate process — another instance — hits the same caller.
    const child = Bun.spawnSync(
      [
        "bun",
        "-e",
        `const { allowRequest } = await import("${process.cwd()}/apps/web/src/server/rate-limit.ts");
         let n = 0; for (let i = 0; i < 40; i++) if (await allowRequest(${JSON.stringify(key)}, ${now})) n++;
         console.log("ALLOWED=" + n); process.exit(0);`,
      ],
      { env: { ...process.env, RATE_LIMIT_STORE: "postgres" } },
    );
    const allowedThere = Number(/ALLOWED=(\d+)/.exec(child.stdout.toString())?.[1] ?? NaN);
    expect(allowedHere).toBe(40);
    expect(allowedThere).toBe(RATE_LIMIT - 40);
    const [row] = (await sql`select hits from rate_limit_hits where key = ${key}`) as unknown as {
      hits: number;
    }[];
    expect(row!.hits).toBe(80);
  });

  test("a different caller has its own budget", async () => {
    process.env["RATE_LIMIT_STORE"] = "postgres";
    expect(await allowRequest(`rl-test-${stamp}-other`)).toBe(true);
  });
});

/**
 * The auth dispatch in src/server.ts. The SSR entry is stubbed so a request
 * that passes the limiter is a 200 and a throttled one is the 429 response.
 * RATE_LIMIT_STORE stays on the default (in-memory), so no database here.
 */
const { AUTH_RATE_LIMIT } = await import("../apps/web/src/server/rate-limit");
mock.module("@tanstack/react-start/server-entry", () => ({
  default: { fetch: async () => new Response("handled") },
}));
// The agent/workflow branches import their handlers only after a request
// passes the limiter (src/server.ts agentApiResponse). Stub both modules so a
// burst exercises the limiter branch alone — no handler env (CRON_SECRET …)
// or database. The marker header proves a request reached the stub, not a
// real handler, so the bursts below stay meaningful if these mocks drift.
const stubbedUnauthorized = () =>
  new Response(JSON.stringify({ error: "Invalid or revoked key." }), {
    status: 401,
    headers: { "content-type": "application/json", "x-burst-stub": "hosted-api" },
  });
mock.module("../apps/web/src/server/agents/hosted-api.server", () => ({
  bearerKey: () => null,
  unauthorized: stubbedUnauthorized,
  handleMcp: async () => new Response("mcp handled"),
  handleAgentApi: async () => new Response("agent handled"),
}));
mock.module("../apps/web/src/server/agents/workflow-app.server", () => ({
  hashWorkflowKey: (key: string) => `stub-hash:${key}`,
  workflowUnauthorized: stubbedUnauthorized,
  resolveWorkflowKey: async () => null,
  handleWorkflowApi: async () => new Response("workflow handled"),
}));
const server = (await import("../apps/web/src/server")).default as {
  fetch: (request: Request) => Promise<Response>;
};

function call(
  path: string,
  ip: string,
  method = "GET",
  headers: Record<string, string> = {},
): Promise<Response> {
  return server.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "x-forwarded-for": ip, ...headers },
    }),
  );
}

describe("auth read endpoints (server dispatch)", () => {
  // The shared-store tests above leave the postgres store selected; these run
  // against the in-process window, so reset it before each one.
  beforeEach(() => {
    delete process.env["RATE_LIMIT_STORE"];
  });

  test(`GET /api/auth/session is 429 after the normal ${RATE_LIMIT}/min budget`, async () => {
    const ip = "10.1.0.1";
    for (let i = 0; i < RATE_LIMIT; i++)
      expect((await call("/api/auth/session", ip)).status).toBe(200);
    expect((await call("/api/auth/session", ip)).status).toBe(429);
  });

  test(`GET /api/auth/me is 429 after the normal ${RATE_LIMIT}/min budget`, async () => {
    const ip = "10.1.0.2";
    for (let i = 0; i < RATE_LIMIT; i++) expect((await call("/api/auth/me", ip)).status).toBe(200);
    expect((await call("/api/auth/me", ip)).status).toBe(429);
  });

  test(`GET /api/auth/confirm hits the tighter ${AUTH_RATE_LIMIT} budget sooner than session does`, async () => {
    const ip = "10.1.0.3";
    for (let i = 0; i < AUTH_RATE_LIMIT; i++)
      expect((await call("/api/auth/confirm", ip)).status).toBe(200);
    expect((await call("/api/auth/confirm", ip)).status).toBe(429);
    expect(AUTH_RATE_LIMIT).toBeLessThan(RATE_LIMIT);
  });

  test(`POST /api/auth/login is 429 after the tighter ${AUTH_RATE_LIMIT} mutation budget`, async () => {
    const ip = "10.1.0.12";
    for (let i = 0; i < AUTH_RATE_LIMIT; i++)
      expect((await call("/api/auth/login", ip, "POST")).status).toBe(200);
    expect((await call("/api/auth/login", ip, "POST")).status).toBe(429);
  });

  test(`POST /api/auth/confirm still hits the ${AUTH_RATE_LIMIT} mutation budget`, async () => {
    const ip = "10.1.0.4";
    for (let i = 0; i < AUTH_RATE_LIMIT; i++)
      expect((await call("/api/auth/confirm", ip, "POST")).status).toBe(200);
    expect((await call("/api/auth/confirm", ip, "POST")).status).toBe(429);
  });

  test("OPTIONS stays exempt on session, me and confirm", async () => {
    const ip = "10.1.0.5";
    for (const path of ["/api/auth/session", "/api/auth/me", "/api/auth/confirm"]) {
      expect((await call(path, ip, "OPTIONS")).status).toBe(200);
    }
  });

  test("a spent session budget does not touch the mutation budgets of the same caller", async () => {
    const ip = "10.1.0.6";
    for (let i = 0; i < RATE_LIMIT; i++)
      expect((await call("/api/auth/session", ip)).status).toBe(200);
    expect((await call("/api/auth/session", ip)).status).toBe(429);
    expect((await call("/api/auth/login", ip, "POST")).status).toBe(200);
    expect((await call("/api/auth/confirm", ip)).status).toBe(200);
  });
});

/**
 * 429 bursts across every limiter branch in src/server.ts. Each test drives
 * one caller (its own x-forwarded-for IP, so buckets never overlap) until the
 * limiter refuses, and asserts the refusal is the tooManyRequests() response
 * (429, retry-after 60, the "Too many requests" detail) at the exact request
 * the branch's budget implies — the /_serverFn, /api/public, agent and
 * /api/mcp branches at the normal RATE_LIMIT, the /api/auth mutation and
 * confirm branches at the tighter AUTH_RATE_LIMIT.
 */
describe("429 bursts across the limiter branches (server dispatch)", () => {
  // The shared-store tests above leave the postgres store selected; these run
  // against the in-process window, so reset it before each one.
  beforeEach(() => {
    delete process.env["RATE_LIMIT_STORE"];
  });

  /** Repeat requests on one caller until the limiter refuses; returns the attempt number. */
  async function burst(path: string, ip: string, method = "GET"): Promise<number> {
    let response: Response | undefined;
    let at = -1;
    for (let i = 1; i <= 200; i++) {
      response = await call(path, ip, method);
      if (response.status === 429) {
        at = i;
        break;
      }
    }
    expect(at).toBeGreaterThan(0);
    expect(response!.status).toBe(429);
    expect(response!.headers.get("retry-after")).toBe("60");
    expect(((await response!.json()) as { detail: string }).detail).toContain("Too many requests");
    return at;
  }

  test("requests on the agent branch reach the stub, never a real handler", async () => {
    const res = await call("/api/mcp", "10.2.0.0");
    expect(res.status).toBe(401);
    expect(res.headers.get("x-burst-stub")).toBe("hosted-api");
  });

  test(`POST /_serverFn/anyFn is 429 after the normal ${RATE_LIMIT}/min budget`, async () => {
    expect(await burst("/_serverFn/anyFn", "10.2.0.1", "POST")).toBe(RATE_LIMIT + 1);
  });

  test(`GET /api/public/agent-tick is 429 after the normal ${RATE_LIMIT}/min budget`, async () => {
    expect(await burst("/api/public/agent-tick", "10.2.0.2")).toBe(RATE_LIMIT + 1);
  });

  test(`POST /api/auth/login is 429 after the tighter ${AUTH_RATE_LIMIT}/min budget`, async () => {
    expect(await burst("/api/auth/login", "10.2.0.3", "POST")).toBe(AUTH_RATE_LIMIT + 1);
  });

  test(`GET /api/agents/whatever is 429 after the normal ${RATE_LIMIT}/min budget`, async () => {
    expect(await burst("/api/agents/whatever", "10.2.0.4")).toBe(RATE_LIMIT + 1);
  });

  test(`GET /api/mcp is 429 after the normal ${RATE_LIMIT}/min budget`, async () => {
    expect(await burst("/api/mcp", "10.2.0.5")).toBe(RATE_LIMIT + 1);
  });

  test(`GET /api/workflows/whatever is 429 after the normal ${RATE_LIMIT}/min budget`, async () => {
    expect(await burst("/api/workflows/whatever", "10.2.0.6")).toBe(RATE_LIMIT + 1);
  });

  test(`GET /api/auth/confirm (tighter ${AUTH_RATE_LIMIT}) is refused earlier than session/me for the same caller`, async () => {
    const ip = "10.3.0.1";
    expect(await burst("/api/auth/confirm", ip)).toBe(AUTH_RATE_LIMIT + 1);
    // Buckets are per caller per path: confirm's ceiling is spent while the
    // same caller's session/me budgets are still untouched — they only
    // refuse RATE_LIMIT requests in (one probe below spends one each, so the
    // drains report RATE_LIMIT, not RATE_LIMIT + 1).
    expect((await call("/api/auth/session", ip)).status).toBe(200);
    expect((await call("/api/auth/me", ip)).status).toBe(200);
    expect(await burst("/api/auth/session", ip)).toBe(RATE_LIMIT);
    expect(await burst("/api/auth/me", ip)).toBe(RATE_LIMIT);
    expect(AUTH_RATE_LIMIT).toBeLessThan(RATE_LIMIT);
  });
});

describe("the /metrics surface (server dispatch)", () => {
  test("GET /metrics is 404 without a token and 401 with a wrong one", async () => {
    const ip = "10.1.0.9";
    const saved = process.env["METRICS_TOKEN"];
    delete process.env["METRICS_TOKEN"];
    try {
      // Off (404) unless METRICS_TOKEN is at least 16 chars — never a leak.
      expect((await call("/metrics", ip)).status).toBe(404);
      process.env["METRICS_TOKEN"] = "metrics-token-0123456789abcdef";
      expect((await call("/metrics", ip)).status).toBe(401);
    } finally {
      if (saved === undefined) delete process.env["METRICS_TOKEN"];
      else process.env["METRICS_TOKEN"] = saved;
    }
  });
});

describe("CSRF guard on the server dispatch", () => {
  beforeEach(() => {
    delete process.env["RATE_LIMIT_STORE"];
  });

  test("a cross-site POST to a server function is refused before the limiter", async () => {
    const ip = "10.1.0.10";
    const refused = await call("/_serverFn/abc123", ip, "POST", { "sec-fetch-site": "cross-site" });
    expect(refused.status).toBe(403);
    // The guard runs before the budget is touched: the same caller without the
    // Fetch-Metadata header (not a browser) still has its full allowance.
    expect((await call("/_serverFn/abc123", ip, "POST")).status).toBe(200);
  });

  test("same-origin POSTs pass; a POST with no Fetch-Metadata or origin passes", async () => {
    const ip = "10.1.0.11";
    expect(
      (await call("/_serverFn/abc123", ip, "POST", { "sec-fetch-site": "same-origin" })).status,
    ).toBe(200);
    expect((await call("/_serverFn/def456", ip, "POST")).status).toBe(200);
  });
});
