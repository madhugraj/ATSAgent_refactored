/**
 * Golden-fixture validator (TS side of the contract round-trip).
 *
 * Every manifest contract must have a golden fixture at
 * `services/<service>/tests/golden/<kebab-case id>.json`, accepted by the zod
 * schema. `services/_template/tests/test_contracts.py` validates the same
 * fixtures against the generated Pydantic models and invokes this script, so
 * both sides are proven to agree on the same bytes (plan Phase 9 rule 5).
 *
 *   bun tools/contracts/validate-fixture.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TOOL_DIR, "..", "..");
const MANIFEST = join(TOOL_DIR, "manifest.json");

const kebab = (id) => id.replaceAll(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

async function main() {
  let checked = 0;
  for (const entry of manifest) {
    const goldenDir = join(REPO_ROOT, "services", entry.service, "tests", "golden");
    const file = join(goldenDir, `${kebab(entry.id)}.json`);
    const golden = JSON.parse(readFileSync(file, "utf8"));
    const abs = join(REPO_ROOT, entry.module);
    const schema = (await import(pathToFileURL(abs).href))[entry.export];
    if (!schema) throw new Error(`${entry.module} does not export ${entry.export}`);
    const parsed = schema.safeParse(golden);
    if (!parsed.success) {
      console.error(`FIXTURE REJECTED ${file}:`);
      console.error(JSON.stringify(parsed.error.issues, null, 2));
      process.exit(1);
    }
    checked++;
    console.log(`ok ${entry.id} <- ${file.replace(`${REPO_ROOT}/`, "")}`);
  }
  console.log(`${checked} golden fixture(s) accepted by their zod schemas`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
