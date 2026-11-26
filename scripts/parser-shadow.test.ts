/**
 * Phase 9b parser shadow hook (apps/web/src/server/parser/shadow.ts):
 * fire-and-forget — the served text never depends on the shadow, failures
 * never throw into the caller, and the diff log carries hashes, never text.
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";

const { shadowParseCompare } = await import("../apps/web/src/server/parser/shadow");

let fetchCalls: { url: string; init: RequestInit }[] = [];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  fetchCalls.push({ url: String(input), init: init ?? {} });
  return new Response(JSON.stringify({ text: "hello" }), { status: 200 });
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe("parser shadow hook", () => {
  afterEach(() => {
    fetchCalls = [];
    delete process.env["PARSER_SHADOW_URL"];
    delete process.env["PARSER_TOKEN"];
  });

  test("calls the shadow URL with the worker's exact wire", async () => {
    process.env["PARSER_SHADOW_URL"] = "http://parser-shadow.internal";
    process.env["PARSER_TOKEN"] = "tok-123";
    await shadowParseCompare("cv.pdf", new TextEncoder().encode("hello"), "hello");
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0]!.url).toBe("http://parser-shadow.internal/parse");
    expect(fetchCalls[0]!.init.method).toBe("POST");
    const headers = fetchCalls[0]!.init.headers as Record<string, string>;
    expect(headers["x-parser-token"]).toBe("tok-123");
    expect(headers["x-file-name"]).toBe(encodeURIComponent("cv.pdf"));
    expect(headers["content-type"]).toBe("application/octet-stream");
  });

  test("no-op without PARSER_SHADOW_URL (shadow off by default)", async () => {
    process.env["PARSER_TOKEN"] = "tok-123";
    await shadowParseCompare("cv.pdf", new TextEncoder().encode("hello"), "hello");
    expect(fetchCalls.length).toBe(0);
  });

  test("a shadow failure never throws into the caller", async () => {
    process.env["PARSER_SHADOW_URL"] = "http://parser-shadow.internal";
    process.env["PARSER_TOKEN"] = "tok-123";
    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;
    await expect(shadowParseCompare("cv.pdf", new Uint8Array([1]), "")).resolves.toBeUndefined();
  });
});

describe("comparison logs carry no document content", () => {
  const originalLog = console.log;
  const originalWarn = console.warn;

  afterEach(() => {
    console.log = originalLog;
    console.warn = originalWarn;
  });

  test("match/diff logs contain only keys, hashes and lengths — never CV text or the filename", async () => {
    process.env["PARSER_SHADOW_URL"] = "http://parser-shadow.internal";
    process.env["PARSER_TOKEN"] = "tok-123";
    const lines: string[] = [];
    // earlier tests in this file swap in a throwing fetch — install a
    // succeeding one for this test
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ text: "hello" }), { status: 200 })) as typeof fetch;
    console.log = (...parts: unknown[]) => lines.push(parts.map(String).join(" "));
    console.warn = (...parts: unknown[]) =>
      lines.push(
        parts.map((p) => (typeof p === "object" ? JSON.stringify(p) : String(p))).join(" "),
      );
    const cvText = "Anita Das, platform engineer, Kubernetes and Go.";
    const cvFile = "anita-das-cv.pdf";
    await shadowParseCompare(
      cvFile,
      new TextEncoder().encode(cvText),
      `${cvText}\n[Hidden text removed from this document: 57 characters]`,
    );
    const joined = lines.join("\n");
    expect(joined).not.toContain(cvText);
    expect(joined).not.toContain(cvFile);
    expect(joined).not.toContain("Anita");
    expect(joined).not.toContain("Hidden text removed");
    // what IS there: the counter fields and the content hash
    expect(joined).toContain("tsSha");
    expect(joined).toContain("filenameLen");
  });
});
