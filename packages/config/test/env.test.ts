/**
 * Smoke tests for the @ats/config per-app env schemas.
 *
 * Run: DATABASE_URL=postgres://…/atsagent_test SESSION_SECRET=… bun test packages/config/test/
 *
 * Importing @ats/config/server runs the combined validation once (it throws
 * on a misconfigured process), which is itself the "boots or fails fast"
 * behaviour under test — these tests then pin the per-app schemas added in
 * the Phase 2 config change.
 */
import { describe, expect, test } from "bun:test";
import { parserEnv, voiceEnv, webEnv } from "@ats/config/server";

const MIN_WEB_ENV = {
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54377/atsagent_test",
  SESSION_SECRET: "f".repeat(32),
  PUBLIC_SITE_URL: "https://ats.example.test",
  SMTP_URL: "smtp://127.0.0.1:1025",
  EMAIL_FROM: "ATS <no-reply@ats.example.test>",
};

describe("webEnv", () => {
  test("parses a minimal realistic web environment", () => {
    const parsed = webEnv.parse({ ...MIN_WEB_ENV });
    expect(parsed.DATABASE_URL).toBe(MIN_WEB_ENV.DATABASE_URL);
    expect(parsed.PUBLIC_SITE_URL).toBe("https://ats.example.test");
    // Optional fields stay optional, defaults still apply, and voice-only
    // fields are not part of the web surface.
    expect(parsed.GITHUB_TOKEN).toBeUndefined();
    expect(parsed.GOOGLE_INDEXING_DAILY_LIMIT).toBe(180);
    expect("SIP_PORT" in parsed).toBe(false);
  });

  test("missing required keys fail with the same issue keys as the combined schema", () => {
    const result = webEnv.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      // Issue keys (paths) are what callers and the boot error surface key on;
      // the message copy for a truly missing key is zod's type-check message.
      expect(result.error.issues.map((i) => i.path.join("."))).toEqual([
        "DATABASE_URL",
        "SESSION_SECRET",
      ]);
    }
  });

  test("custom messages fire for present-but-invalid values, as in the combined schema", () => {
    const result = webEnv.safeParse({
      DATABASE_URL: "",
      SESSION_SECRET: "too-short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toEqual([
        "DATABASE_URL is required",
        "SESSION_SECRET must be at least 32 characters",
      ]);
    }
  });

  test("a short SESSION_SECRET is rejected with the combined schema's message", () => {
    const result = webEnv.safeParse({
      DATABASE_URL: MIN_WEB_ENV.DATABASE_URL,
      SESSION_SECRET: "too-short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toEqual([
        "SESSION_SECRET must be at least 32 characters",
      ]);
    }
  });
});

describe("voiceEnv", () => {
  test("parses a voice worker environment and applies the SIP defaults", () => {
    const parsed = voiceEnv.parse({
      DATABASE_URL: MIN_WEB_ENV.DATABASE_URL,
      SIP_SERVER: "pbx.example.test",
      SIP_USER: "1001",
      SIP_PASSWORD: "dial-tone",
    });
    expect(parsed.SIP_PORT).toBe(5060);
    expect(parsed.VOICE_MAX_CONCURRENT).toBe(2);
    expect(parsed.SIP_AUTH_USER).toBeUndefined();
  });

  test("does not require web-only secrets", () => {
    const parsed = voiceEnv.parse({ DATABASE_URL: MIN_WEB_ENV.DATABASE_URL });
    expect(parsed.VOICE_MAX_CONCURRENT).toBe(2);
  });
});

describe("parserEnv", () => {
  test("holds no database or organisation secrets", () => {
    const parsed = parserEnv.parse({ ...process.env, DATABASE_URL: MIN_WEB_ENV.DATABASE_URL });
    expect(Object.keys(parsed)).toEqual([]);
  });
});
