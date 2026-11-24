/**
 * Unit tests for the scheduler bearer gate (@ats/platform-http cron-auth):
 * CRON_SECRET with CRON_SECRET_PREVIOUS accepted during rotation.
 *
 * Run: DATABASE_URL=… SESSION_SECRET=… bun test packages/platform-http/test/
 */
import { afterAll, describe, expect, test } from "bun:test";

import { authenticateCronRequest } from "../src/server";

const CURRENT = "cron-secret-current-0123456789abcdef";
const PREVIOUS = "cron-secret-previous-fedcba9876543210";
const saved = {
  current: process.env["CRON_SECRET"],
  previous: process.env["CRON_SECRET_PREVIOUS"],
};

afterAll(() => {
  if (saved.current === undefined) delete process.env["CRON_SECRET"];
  else process.env["CRON_SECRET"] = saved.current;
  if (saved.previous === undefined) delete process.env["CRON_SECRET_PREVIOUS"];
  else process.env["CRON_SECRET_PREVIOUS"] = saved.previous;
});

function call(token?: string): Promise<Response> {
  return authenticateCronRequest(
    new Request("http://x/api/public/agent-tick", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
  ) as Promise<Response>;
}

describe("authenticateCronRequest", () => {
  test("500 while CRON_SECRET is not configured", async () => {
    delete process.env["CRON_SECRET"];
    expect((await call(CURRENT)).status).toBe(500);
  });

  test("401 without a bearer token or with the wrong secret", async () => {
    process.env["CRON_SECRET"] = CURRENT;
    delete process.env["CRON_SECRET_PREVIOUS"];
    expect((await call()).status).toBe(401);
    expect((await call("not-the-secret")).status).toBe(401);
    // Malformed header (comma lists are refused, not split).
    const malformed = await authenticateCronRequest(
      new Request("http://x/api/public/agent-tick", {
        headers: { authorization: `Bearer ${CURRENT}, ${PREVIOUS}` },
      }),
    );
    expect(malformed?.status).toBe(401);
  });

  test("null (allowed) for the current secret and the previous one during rotation", async () => {
    process.env["CRON_SECRET"] = CURRENT;
    expect(await call(CURRENT)).toBeNull();
    process.env["CRON_SECRET_PREVIOUS"] = PREVIOUS;
    expect(await call(CURRENT)).toBeNull();
    expect(await call(PREVIOUS)).toBeNull();
  });
});
