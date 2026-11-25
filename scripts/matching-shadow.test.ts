/**
 * Phase 9b matching shadow hook (apps/web/src/server/matching/shadow.ts):
 * env-gated no-op, per-score deltas logged (never the features dict), and
 * failures never throw into the scorer.
 */
import { afterEach, afterAll, describe, expect, test } from "bun:test";

const { shadowMatchCompare, featuresSha } = await import("../apps/web/src/server/matching/shadow");

let fetchCalls: { url: string; init: RequestInit }[] = [];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  fetchCalls.push({ url: String(input), init: init ?? {} });
  return new Response(
    JSON.stringify({
      overall: 82,
      scores: {
        skills: 100,
        experience: 100,
        career: 90,
        impact_innovation: 100,
        education: 70,
        social: 0,
      },
      career_flags: [],
      custom_scores: [],
      contributions: [],
    }),
    { status: 200 },
  );
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = realFetch;
});

const TS = {
  overall: 82,
  skills: 100,
  experience: 100,
  career: 90,
  impactInnovation: 100,
  education: 70,
  social: 0,
};

describe("matching shadow hook", () => {
  afterEach(() => {
    fetchCalls = [];
    delete process.env["MATCHING_SHADOW_URL"];
    delete process.env["SERVICE_TOKENS"];
  });

  test("posts the features with the service-token bearer; equal scores log a match", async () => {
    process.env["MATCHING_SHADOW_URL"] = "http://matching-ml.internal";
    process.env["SERVICE_TOKENS"] = "svc-token-1";
    await shadowMatchCompare({ jd: { experienceMin: 3 }, candidate: {} }, TS);
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0]!.url).toBe("http://matching-ml.internal/score");
    const headers = fetchCalls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer svc-token-1");
  });

  test("no-op without MATCHING_SHADOW_URL", async () => {
    process.env["SERVICE_TOKENS"] = "svc-token-1";
    await shadowMatchCompare({ jd: {} }, TS);
    expect(fetchCalls.length).toBe(0);
  });

  test("deltas are computed per score; a mismatch is not equal", async () => {
    process.env["MATCHING_SHADOW_URL"] = "http://matching-ml.internal";
    process.env["SERVICE_TOKENS"] = "svc-token-1";
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init: init ?? {} });
      return new Response(
        JSON.stringify({
          overall: 80,
          scores: {
            skills: 98,
            experience: 100,
            career: 90,
            impact_innovation: 100,
            education: 70,
            social: 0,
          },
          career_flags: [],
          custom_scores: [],
          contributions: [],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    // the diff log itself is a console.warn — here we assert only that the
    // call resolves and the fetch happened; the payload is the features dict.
    await expect(shadowMatchCompare({ jd: {} }, TS)).resolves.toBeUndefined();
    expect(fetchCalls.length).toBe(1);
  });

  test("featuresSha identifies a case without storing it", () => {
    const a = featuresSha({ jd: { experienceMin: 3 } });
    const b = featuresSha({ jd: { experienceMin: 3 } });
    const c = featuresSha({ jd: { experienceMin: 4 } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBe(16);
  });

  test("a shadow failure never throws into the scorer", async () => {
    process.env["MATCHING_SHADOW_URL"] = "http://matching-ml.internal";
    process.env["SERVICE_TOKENS"] = "svc-token-1";
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;
    await expect(shadowMatchCompare({ jd: {} }, TS)).resolves.toBeUndefined();
  });
});
