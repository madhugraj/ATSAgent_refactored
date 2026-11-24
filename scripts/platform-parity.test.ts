/**
 * CI wrapper for scripts/check-platform-parity.mjs (Phase 3 hardening): the
 * refactored apps/web/src/server.ts must keep the checked-in bca8574 source
 * snapshot's limiter path prefixes and CSRF origins — the script prints a diff
 * and exits non-zero otherwise. No environment or database needed.
 * Run: bun test scripts/platform-parity.test.ts
 */
import { expect, test } from "bun:test";

test("refactored server.ts keeps the bca8574 source's limiter prefixes and CSRF origins", () => {
  const proc = Bun.spawnSync(["node", "scripts/check-platform-parity.mjs"], {
    cwd: `${import.meta.dir}/..`,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = `${proc.stdout.toString()}${proc.stderr.toString()}`;
  if (proc.exitCode !== 0) console.error(out);
  expect(proc.exitCode).toBe(0);
});
