/**
 * POST /api/internal/ai (apps/web/src/routes/api/internal/ai.ts) — the Phase 9
 * Python services' AI callback: service-token auth (401s), body validation
 * (400s), gateway passthrough with vendor/model stripping, generic failure
 * messages.
 *
 * The gateway is mocked (mock.module matches by path, refactor rule 7) — no
 * provider call happens and the route itself does no DB reads.
 * Run: DATABASE_URL=... SESSION_SECRET=... bun test scripts/internal-ai-route.test.ts
 */
import { beforeAll, describe, expect, mock, test } from "bun:test";

const realGateway = await import("../apps/web/src/lib/ai-gateway.server");

type GatewayResult = Record<string, unknown>;
let gatewayReply: () => GatewayResult = () => ({
  ok: true,
  data: { score: 0.9 },
  usage: { promptTokens: 11, completionTokens: 4, totalTokens: 15 },
  // What a real success carries — the route must strip these:
  model: "gpt-5.5",
  provider: "openai",
});

mock.module("../apps/web/src/lib/ai-gateway.server", () => ({
  ...realGateway,
  aiJson: async () => gatewayReply(),
}));

const TOKEN = "test-callback-token-0123456789abcdef";

const { Route } = await import("../apps/web/src/routes/api/internal/ai");

const post = (body: unknown, headers: Record<string, string> = {}) =>
  (
    Route.options as unknown as {
      server: { handlers: { POST: (a: { request: Request }) => Promise<Response> } };
    }
  ).server.handlers.POST({
    request: new Request("http://x/api/internal/ai", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  });

const authed = (body: unknown) => post(body, { authorization: `Bearer ${TOKEN}` });

const VALID = {
  feature: "candidate_score",
  input: {
    system: "Judge the application against the job. Return JSON only.",
    prompt: "JD and CV follow.",
    orgId: "7e9b1f52-3a44-4c1b-9c2e-8f1d2a3b4c5d",
  },
};

beforeAll(() => {
  process.env["SERVICE_TOKENS"] = `first-token,${TOKEN}`;
});

describe("service-token auth", () => {
  test("missing token is a generic 401", async () => {
    const res = await post(VALID);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { message: string }).message).toBe("Unauthorized");
  });

  test("wrong token is a generic 401", async () => {
    const res = await post(VALID, { authorization: "Bearer wrong-token" });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { message: string }).message).toBe("Unauthorized");
  });

  test("empty SERVICE_TOKENS fails closed", async () => {
    const previous = process.env["SERVICE_TOKENS"];
    process.env["SERVICE_TOKENS"] = "";
    try {
      expect((await authed(VALID)).status).toBe(401);
    } finally {
      process.env["SERVICE_TOKENS"] = previous;
    }
  });
});

describe("body validation", () => {
  test("invalid JSON is 400", async () => {
    expect((await post("not json{", { authorization: `Bearer ${TOKEN}` })).status).toBe(400);
  });

  test("missing feature is 400", async () => {
    expect((await authed({ input: VALID.input })).status).toBe(400);
  });

  test("unknown feature slug is 400", async () => {
    expect((await authed({ ...VALID, feature: "bias_report" })).status).toBe(400);
  });

  test("input missing orgId is 400", async () => {
    const { orgId: _orgId, ...rest } = VALID.input;
    expect((await authed({ feature: VALID.feature, input: rest })).status).toBe(400);
  });

  test("non-uuid orgId is 400", async () => {
    expect(
      (await authed({ ...VALID, input: { ...VALID.input, orgId: "not-a-uuid" } })).status,
    ).toBe(400);
  });
});

describe("gateway passthrough", () => {
  test("success shape carries data + usage and no vendor or model fields", async () => {
    const res = await authed(VALID);
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text) as { ok: boolean; data: unknown; usage: unknown };
    expect(body).toEqual({
      ok: true,
      data: { score: 0.9 },
      usage: { promptTokens: 11, completionTokens: 4, totalTokens: 15 },
    });
    // Top-level fields, nested data and the whole raw wire text: vendor-neutral.
    expect(text).not.toMatch(/openai|anthropic|google|gpt|claude|gemini/i);
    expect("model" in body).toBe(false);
    expect("provider" in body).toBe(false);
  });

  test("vendor names nested inside data are stripped too", async () => {
    gatewayReply = () => ({
      ok: true,
      data: { score: 0.9, engine: "x", nested: { model: "gemini-2.5-flash" } },
      usage: null,
    });
    try {
      const res = await authed(VALID);
      const text = await res.text();
      expect(text).not.toMatch(/gemini|engine|model/i);
      expect((JSON.parse(text) as { data: Record<string, unknown> }).data.nested).toEqual({});
    } finally {
      gatewayReply = () => ({
        ok: true,
        data: { score: 0.9 },
        usage: { promptTokens: 11, completionTokens: 4, totalTokens: 15 },
        model: "gpt-5.5",
        provider: "openai",
      });
    }
  });

  test("gateway failure maps the status and stays generic", async () => {
    gatewayReply = () => ({
      ok: false,
      status: 502,
      message: "AI request failed: model gpt-5.5 is deprecated for this key",
    });
    try {
      const res = await authed(VALID);
      expect(res.status).toBe(502);
      const text = await res.text();
      expect(JSON.parse(text) as { ok: boolean; message: string }).toEqual({
        ok: false,
        message: "AI request failed.",
      });
      expect(text).not.toMatch(/gpt|model|deprecated/i);
    } finally {
      gatewayReply = () => ({
        ok: true,
        data: { score: 0.9 },
        usage: { promptTokens: 11, completionTokens: 4, totalTokens: 15 },
        model: "gpt-5.5",
        provider: "openai",
      });
    }
  });
});
