import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Smoke lock for the empty package skeleton: the dual entry points stay
// declared while the Phase 4 move PRs fill them.
describe("@ats/integrations scaffold", () => {
  test("declares ./shared and ./server exports", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.name).toBe("@ats/integrations");
    expect(Object.keys(pkg.exports).sort()).toEqual(["./server", "./shared"]);
  });
});
