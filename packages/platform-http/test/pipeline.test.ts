/**
 * Unit tests for the @ats/platform-http request-pipeline pieces (map §4 L1):
 * the rate-limit path rules and budgets, the CSRF guard, the /metrics gate,
 * the security headers/CSP nonce and the composable dispatch (agent branch,
 * auth-mutation/auth-read budgets, OPTIONS exemption).
 *
 * The whole pipeline driven through apps/web/src/server.ts's exported fetch
 * stays in scripts/rate-limit.test.ts — it imports the app, so it cannot move
 * into this package.
 *
 * Run: DATABASE_URL=… SESSION_SECRET=… bun test packages/platform-http/test/
 */
import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import {
  AGENT_API_KEY_LIMIT,
  allowInMemory,
  applySecurityHeaders,
  AUTH_RATE_LIMIT,
  csrfGuard,
  isAgentApiPath,
  isAuthMutationPath,
  isAuthReadPath,
  isPublicApiPath,
  isServerFnPath,
  isWorkflowApiPath,
  metricsResponse,
  RATE_LIMIT,
  rateLimitedDispatch,
  RATE_WINDOW_MS,
  requestUrl,
  slidingCount,
  tooManyRequests,
  type PipelineApp,
} from "../src/server";

const app: PipelineApp = {
  loadServerEntry: async () => ({ fetch: async () => new Response("handled") }),
  renderErrorPage: () => "<!doctype html><html><body>error</body></html>",
  handleAgentApi: async () => new Response("agent-api"),
};

function call(path: string, ip: string, method = "GET"): Promise<Response> {
  return rateLimitedDispatch(
    new Request(`http://localhost${path}`, { method, headers: { "x-forwarded-for": ip } }),
    requestUrl(new Request(`http://localhost${path}`))!,
    "api",
    undefined,
    undefined,
    app,
  );
}

const METRICS_TOKEN = "metrics-test-token-0123456789";
const prevTokenEnv = process.env["METRICS_TOKEN"];

afterAll(() => {
  if (prevTokenEnv === undefined) delete process.env["METRICS_TOKEN"];
  else process.env["METRICS_TOKEN"] = prevTokenEnv;
});

beforeEach(() => {
  // The dispatch must use the in-process window here (the shared Postgres
  // store is covered by scripts/rate-limit.test.ts against a real database).
  delete process.env["RATE_LIMIT_STORE"];
});

describe("rate-limit path rules", () => {
  test("the budgets and windows are unchanged", () => {
    expect(RATE_LIMIT).toBe(60);
    expect(RATE_WINDOW_MS).toBe(60_000);
    expect(AUTH_RATE_LIMIT).toBe(10);
    expect(AGENT_API_KEY_LIMIT).toBe(30);
  });

  test("public, server-fn, agent/workflow and auth path shapes", () => {
    expect(isPublicApiPath("/api/public")).toBe(true);
    expect(isPublicApiPath("/api/public/apply")).toBe(true);
    expect(isPublicApiPath("/api/auth/login")).toBe(false);
    expect(isServerFnPath("/_serverFn")).toBe(true);
    expect(isServerFnPath("/_serverFn/getSession")).toBe(true);
    expect(isServerFnPath("/_serverFnx")).toBe(false);
    expect(isAgentApiPath("/api/agents/invocations")).toBe(true);
    expect(isAgentApiPath("/api/mcp")).toBe(true);
    expect(isAgentApiPath("/api/workflows/runs")).toBe(true);
    expect(isWorkflowApiPath("/api/workflows/runs")).toBe(true);
    expect(isAgentApiPath("/api/public/agent-tick")).toBe(false);
    expect(isAuthMutationPath("/api/auth")).toBe(true);
    expect(isAuthMutationPath("/api/auth/login")).toBe(true);
    expect(isAuthMutationPath("/api/auth/confirm")).toBe(true);
    expect(isAuthMutationPath("/api/auth/session")).toBe(false);
    expect(isAuthMutationPath("/api/auth/me")).toBe(false);
    expect(isAuthReadPath("/api/auth/session")).toBe(true);
    expect(isAuthReadPath("/api/auth/me")).toBe(true);
    expect(isAuthReadPath("/api/auth/confirm")).toBe(true);
    expect(isAuthReadPath("/api/auth/login")).toBe(false);
  });

  test("the per-instance window allows up to the limit, then refuses", () => {
    const key = "pkg-mem";
    const t0 = 5_000_000;
    for (let i = 0; i < 5; i++) expect(allowInMemory(key, t0 + i, 5)).toBe(true);
    expect(allowInMemory(key, t0 + 5, 5)).toBe(false);
    expect(allowInMemory(key, t0 + 60_001 + 5, 5)).toBe(true);
  });

  test("the sliding estimate fades the previous window out", () => {
    expect(slidingCount(60, 0, 0)).toBe(60);
    expect(slidingCount(60, 10, 0.5)).toBe(40);
    expect(slidingCount(60, 10, 1)).toBe(10);
  });
});

describe("csrf guard", () => {
  test("only mutating methods on auth and server-fn paths are guarded", () => {
    expect(
      csrfGuard(new Request("http://x/api/auth/login", { method: "POST" }), "/api/auth/login"),
    ).toBeNull();
    expect(
      csrfGuard(new Request("http://x/api/other", { method: "POST" }), "/api/other"),
    ).toBeNull();
    expect(csrfGuard(new Request("http://x/api/auth/login"), "/api/auth/login")).toBeNull();
  });

  test("cross-site and same-site browser mutations are refused with 403", () => {
    const make = (site: string) =>
      new Request("http://x/_serverFn/abc", {
        method: "POST",
        headers: { "sec-fetch-site": site },
      });
    const refused = csrfGuard(make("cross-site"), "/_serverFn/abc");
    expect(refused?.status).toBe(403);
    expect(refused?.headers.get("cache-control")).toBe("no-store");
    expect(csrfGuard(make("same-site"), "/_serverFn/abc")?.status).toBe(403);
    expect(csrfGuard(make("same-origin"), "/_serverFn/abc")).toBeNull();
    expect(csrfGuard(make("none"), "/_serverFn/abc")).toBeNull();
  });

  test("a non-browser mutation without fetch metadata is allowed on our origins only", () => {
    const make = (origin?: string) =>
      new Request("http://x/api/auth/login", {
        method: "POST",
        headers: origin ? { origin } : {},
      });
    expect(csrfGuard(make(), "/api/auth/login")).toBeNull();
    expect(csrfGuard(make("http://localhost:9000"), "/api/auth/login")).toBeNull();
    expect(csrfGuard(make("http://localhost:9000/"), "/api/auth/login")).toBeNull();
    expect(csrfGuard(make("https://evil.example"), "/api/auth/login")?.status).toBe(403);
  });
});

describe("dispatch branches", () => {
  test("OPTIONS is exempt from both the CSRF guard and every budget", async () => {
    for (const path of ["/api/auth/session", "/api/auth/confirm", "/api/public/agent-tick"]) {
      const response = await call(path, "10.9.0.1", "OPTIONS");
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("handled");
    }
  });

  test("the agent branch routes to the injected agent handler", async () => {
    const response = await call("/api/agents/invocations", "10.9.0.2", "POST");
    expect(await response.text()).toBe("agent-api");
  });

  test(`POST /api/auth/login is throttled at the ${AUTH_RATE_LIMIT} mutation budget`, async () => {
    const ip = "10.9.0.3";
    for (let i = 0; i < AUTH_RATE_LIMIT; i++)
      expect((await call("/api/auth/login", ip, "POST")).status).toBe(200);
    expect((await call("/api/auth/login", ip, "POST")).status).toBe(429);
  });

  test(`GET /api/auth/confirm is throttled at the ${AUTH_RATE_LIMIT} budget too`, async () => {
    const ip = "10.9.0.4";
    for (let i = 0; i < AUTH_RATE_LIMIT; i++)
      expect((await call("/api/auth/confirm", ip)).status).toBe(200);
    expect((await call("/api/auth/confirm", ip)).status).toBe(429);
  });

  test(`GET /api/auth/session runs on the normal ${RATE_LIMIT} budget`, async () => {
    const ip = "10.9.0.5";
    for (let i = 0; i < RATE_LIMIT; i++)
      expect((await call("/api/auth/session", ip)).status).toBe(200);
    expect((await call("/api/auth/session", ip)).status).toBe(429);
  });
});

describe("metrics response", () => {
  test("404 while METRICS_TOKEN is unset or too short", () => {
    delete process.env["METRICS_TOKEN"];
    expect(metricsResponse(new Request("http://x/metrics")).status).toBe(404);
    process.env["METRICS_TOKEN"] = "short";
    expect(metricsResponse(new Request("http://x/metrics")).status).toBe(404);
  });

  test("401 on a wrong bearer, 200 OpenMetrics on the right one", () => {
    process.env["METRICS_TOKEN"] = METRICS_TOKEN;
    const wrong = metricsResponse(
      new Request("http://x/metrics", { headers: { authorization: `Bearer nope` } }),
    );
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("www-authenticate")).toBe("Bearer");
    const ok = metricsResponse(
      new Request("http://x/metrics", { headers: { authorization: `Bearer ${METRICS_TOKEN}` } }),
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.headers.get("content-type")).toContain("application/openmetrics-text");
    expect(ok.headers.get("content-type")).toContain("version=1.0.0");
  });
});

describe("security headers", () => {
  test("every response gets HSTS; non-HTML stops there", async () => {
    const response = await applySecurityHeaders(new Response("{}"), new Request("http://x/"));
    expect(response.headers.get("strict-transport-security")).toBe(
      "max-age=31536000; includeSubDomains",
    );
    expect(response.headers.get("content-security-policy")).toBeNull();
  });

  test("HTML gets a per-response CSP nonce stamped onto inline scripts", async () => {
    const html = `<!doctype html><html><head><script>init()</script></head><body><script nonce="keep">kept()</script></body></html>`;
    const response = await applySecurityHeaders(
      new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } }),
      new Request("http://x/"),
    );
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = /script-src 'self' 'nonce-([0-9a-f]{32})'/.exec(csp)?.[1];
    expect(nonce).toBeDefined();
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const body = await response.text();
    expect(body).toContain(`<script nonce="${nonce}"`);
    // A script that already carries a nonce keeps its own.
    expect(body).toContain(`<script nonce="keep"`);
  });

  test("the throttled response is the shared 429 shape", async () => {
    const response = tooManyRequests();
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(((await response.json()) as { status: string }).status).toBe("error");
  });
});
