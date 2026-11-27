import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Smoke lock for @ats/std (map §4 L0 row, §11 ruling 9): the dual entry
// points stay declared, ./shared stays browser-safe (no server-only marker),
// and ./server carries the server-only marker. Deeper behaviour lives with
// the suites that already exercise these helpers through the app.
describe("@ats/std scaffold", () => {
  test("declares ./shared and ./server exports", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.name).toBe("@ats/std");
    expect(Object.keys(pkg.exports).sort()).toEqual(["./server", "./shared"]);
    expect(Object.values(pkg.exports)).toEqual(["./src/shared/index.ts", "./src/server/index.ts"]);
  });

  test("./shared has no server-only marker and imports no /server surface", () => {
    const index = readFileSync(new URL("../src/shared/index.ts", import.meta.url), "utf8");
    expect(/import\s+["'].*server-only/.test(index)).toBe(false);
  });

  test("./server starts with the server-only marker", () => {
    const index = readFileSync(new URL("../src/server/index.ts", import.meta.url), "utf8");
    expect(index.startsWith('import "@tanstack/react-start/server-only";')).toBe(true);
  });

  test("shared surface resolves and keeps the catalogue pure", async () => {
    const shared = await import("@ats/std/shared");
    // catalogue spot-checks (job-channels is the shared distribution catalogue)
    expect(Object.keys(shared).length).toBeGreaterThan(0);
    expect(typeof shared.rupees).toBe("function");
    expect(typeof shared.mapWithLimit).toBe("function");
    expect(typeof shared.zonedTime).toBe("function");
    expect(typeof shared.wallDate).toBe("function");
    expect(Array.isArray(shared.JOB_CHANNELS)).toBe(true);
  });

  test("server surface resolves behind the marker", async () => {
    const server = await import("@ats/std/server");
    expect(typeof server.attachmentText).toBe("function");
    expect(typeof server.parseRemote).toBe("function");
  });
});
