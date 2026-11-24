// Platform parity check (Phase 3 hardening, docs/refactor/01-module-boundary-map.md
// §6 "Rate limits on public routes and RPCs": keys use URL paths — do not change
// /api/public, /api/auth or /_serverFn prefixes).
//
// Extracts, from each of two server.ts files:
//   (a) every path prefix the limiter branches on — the literal strings inside
//       isPublicApiPath / isAgentApiPath / isServerFnPath / isAuthMutationPath /
//       isAuthReadPath (plus the isWorkflowApiPath helper when present) and the
//       "/metrics" branch literal; and
//   (b) the origin list inside allowedPostOrigins().
// The source file's sets and the refactored file's sets must match exactly:
// prefixes as an exact set, origins order-insensitive. Exit 1 with a diff on
// any mismatch, and also when an expected branch can no longer be found — a
// vanished extraction anchor is itself a parity break.
//
// Usage:
//   node scripts/check-platform-parity.mjs <source-file> <refactored-file>
// Defaults to the checked-in bca8574 source snapshot vs the refactored
// apps/web/src/server.ts. No environment or database needed.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_SOURCE = "docs/refactor/evidence/server-source-bca8574.ts";
const DEFAULT_REFACTORED = "apps/web/src/server.ts";

/** Functions whose bodies hold the limiter's path-prefix literals. */
const REQUIRED_PATH_FNS = [
  "isPublicApiPath",
  "isAgentApiPath",
  "isServerFnPath",
  "isAuthMutationPath",
  "isAuthReadPath",
];
/** Optional helpers reached from the branches above (kept when still named so). */
const OPTIONAL_PATH_FNS = ["isWorkflowApiPath"];

/**
 * One pass over the source that returns the code with comments and string
 * VALUES blanked (same length, so indices stay aligned) plus every string
 * literal with its index. Blanking keeps brace matching exact; keeping indices
 * lets callers pick the literals that fall inside a given function body.
 */
function scan(source) {
  let code = "";
  const strings = [];
  let mode = "code"; // code | line | block | " | ' | `
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === "code") {
      if (c === "/" && next === "/") {
        mode = "line";
        code += "  ";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        mode = "block";
        code += "  ";
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") {
        mode = c;
        strings.push({ start: i, value: "" });
        code += c;
        i += 1;
        continue;
      }
      code += c;
      i += 1;
      continue;
    }
    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        code += c;
      } else code += " ";
      i += 1;
      continue;
    }
    if (mode === "block") {
      if (c === "*" && next === "/") {
        mode = "code";
        code += "  ";
        i += 2;
        continue;
      }
      code += c === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }
    // Inside a string literal.
    if (c === "\\") {
      strings.at(-1).value += source.slice(i, i + 2);
      code += "  ";
      i += 2;
      continue;
    }
    if (c === mode) {
      mode = "code";
      code += c;
      i += 1;
      continue;
    }
    strings.at(-1).value += c;
    code += " ";
    i += 1;
  }
  return { code, strings };
}

/**
 * The {start, end} index range of a named function's body in comment- and
 * string-blanked code, following both `function name(` and `const name =`
 * declarations. Returns null when the file does not declare it.
 */
function functionBody(code, name) {
  const patterns = [
    new RegExp(`\\b(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`),
    new RegExp(`\\b(?:export\\s+)?(?:const|let|var)\\s+${name}\\s*=`),
  ];
  for (const re of patterns) {
    const m = re.exec(code);
    if (!m) continue;
    const open = code.indexOf("{", m.index + m[0].length - 1);
    if (open === -1) continue;
    let depth = 0;
    for (let i = open; i < code.length; i++) {
      if (code[i] === "{") depth += 1;
      else if (code[i] === "}") {
        depth -= 1;
        if (depth === 0) return { start: open, end: i };
      }
    }
  }
  return null;
}

function literalsInBody(strings, body) {
  return strings.filter((s) => s.start >= body.start && s.start <= body.end).map((s) => s.value);
}

function extractPathPrefixes(file, label, problems) {
  const { code, strings } = file;
  const prefixes = new Map(); // prefix -> declaring function
  for (const name of [...REQUIRED_PATH_FNS, ...OPTIONAL_PATH_FNS]) {
    const body = functionBody(code, name);
    if (!body) {
      if (REQUIRED_PATH_FNS.includes(name))
        problems.push(`${label}: limiter branch ${name}() not found — cannot check parity`);
      continue;
    }
    for (const value of literalsInBody(strings, body)) {
      if (value.startsWith("/")) prefixes.set(value, name);
    }
  }
  // The "/metrics" branch: the literal in the dispatch (`url.pathname === "/metrics"`).
  const metrics = strings.some((s) => s.value === "/metrics");
  if (!metrics)
    problems.push(`${label}: the "/metrics" branch literal was not found — cannot check parity`);
  return prefixes;
}

function extractOrigins(file, label, problems) {
  const body = functionBody(file.code, "allowedPostOrigins");
  if (!body) {
    problems.push(`${label}: allowedPostOrigins() not found — cannot check parity`);
    return new Set();
  }
  return new Set(literalsInBody(file.strings, body).filter((o) => o.startsWith("http")));
}

function diffSets(name, source, refactored) {
  const onlySource = [...source].filter((v) => !refactored.has(v)).sort();
  const onlyRefactored = [...refactored].filter((v) => !source.has(v)).sort();
  if (onlySource.length === 0 && onlyRefactored.length === 0) {
    console.log(`${name} (${source.size}): match`);
    return true;
  }
  console.log(`${name}: MISMATCH (source ${source.size}, refactored ${refactored.size})`);
  for (const v of onlySource) console.log(`  - only in the source file: ${JSON.stringify(v)}`);
  for (const v of onlyRefactored)
    console.log(`  + only in the refactored file: ${JSON.stringify(v)}`);
  return false;
}

const [, , sourceArg = DEFAULT_SOURCE, refactoredArg = DEFAULT_REFACTORED] = process.argv;
const sourcePath = resolve(root, sourceArg);
const refactoredPath = resolve(root, refactoredArg);

const problems = [];
const source = { code: "", strings: [] };
const refactored = { code: "", strings: [] };
try {
  Object.assign(source, scan(readFileSync(sourcePath, "utf8")));
} catch {
  problems.push(`source file unreadable: ${sourcePath}`);
}
try {
  Object.assign(refactored, scan(readFileSync(refactoredPath, "utf8")));
} catch {
  problems.push(`refactored file unreadable: ${refactoredPath}`);
}

console.log(`source:     ${sourceArg}`);
console.log(`refactored: ${refactoredArg}`);

if (problems.length === 0) {
  if (problems.length === 0) {
    const okPrefixes = diffSets(
      "limiter path prefixes",
      new Set(extractPathPrefixes(source, "source", problems).keys()),
      new Set(extractPathPrefixes(refactored, "refactored", problems).keys()),
    );
    const okOrigins = diffSets(
      "csrf origins (order-insensitive)",
      extractOrigins(source, "source", problems),
      extractOrigins(refactored, "refactored", problems),
    );
    if (okPrefixes && okOrigins && problems.length === 0) {
      console.log("parity: ok");
      process.exit(0);
    }
  }
}
for (const p of problems) console.error(`error: ${p}`);
console.error("parity: FAILED");
process.exit(1);
