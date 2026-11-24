/**
 * Contract generator (refactor plan Phase 9 rule 5): TS zod schemas → JSON
 * Schema → Pydantic models. Run with bun (it imports the TS schema modules):
 *
 *   bun tools/contracts/generate.mjs          # write the generated models
 *   bun tools/contracts/generate.mjs --check  # exit 1 when the files on disk differ
 *
 * The manifest (tools/contracts/manifest.json) lists every contract: schema id,
 * the owning service, the zod module and its export. Output lands in
 * `services/<service>/app/contracts_gen/<module-stem>.py`, committed; CI runs
 * this tool with --check so a schema change without regenerating fails.
 *
 * The JSON Schema → Pydantic emitter supports the subset the zod contracts use
 * (objects, strings with uuid/date formats and length bounds, integers with
 * bounds, floats, booleans, arrays, string enums, literals, nullable/optional
 * members). Anything outside the subset fails loudly instead of emitting a
 * wrong model. Dropped on purpose: zod's uuid/date `pattern` regexes (the
 * native Python types validate the same formats) and the ±SAFE_INTEGER bounds
 * zod adds to every integer.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { z } from "zod";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(TOOL_DIR, "..", "..");
const MANIFEST = join(TOOL_DIR, "manifest.json");

const SAFE_INT = 9_007_199_254_740_991;
const GENERATOR_NOTE = "GENERATED — do not edit; run bun tools/contracts/generate.mjs";

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

/** Group manifest entries by source module so one .py file holds one module's models. */
function groupByModule(entries) {
  const byModule = new Map();
  for (const entry of entries) {
    const list = byModule.get(entry.module) ?? [];
    list.push(entry);
    byModule.set(entry.module, list);
  }
  return byModule;
}

async function loadSchemaExport(entry) {
  const abs = join(REPO_ROOT, entry.module);
  const mod = await import(pathToFileURL(abs).href);
  const schema = mod[entry.export];
  if (!schema) throw new Error(`${entry.module} does not export ${entry.export}`);
  return schema;
}

/* --------------------------------------------------------- pydantic emitter */

const PY_FORMAT_TYPES = {
  uuid: { type: "uuid.UUID", imports: ["uuid"], dropPattern: true },
  date: { type: "date", imports: ["date"], dropPattern: true },
  "date-time": { type: "datetime", imports: ["datetime"], dropPattern: true },
};

/** Import name -> [module, member]; member null = a plain `import <module>`. */
const IMPORT_SOURCES = {
  uuid: ["uuid", null],
  date: ["datetime", "date"],
  datetime: ["datetime", "datetime"],
  Any: ["typing", "Any"],
  Literal: ["typing", "Literal"],
  BaseModel: ["pydantic", "BaseModel"],
  ConfigDict: ["pydantic", "ConfigDict"],
  Field: ["pydantic", "Field"],
};

const PY_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

/** `from` -> `from_` + alias; the wire name stays the JSON key on both sides. */
function pythonFieldName(field) {
  return PY_KEYWORDS.has(field) ? `${field}_` : field;
}

function isStdlibModule(module) {
  return module !== "pydantic";
}

/** Grouped, isort-ordered import lines: stdlib plain, stdlib from, third-party from. */
function importLines(used) {
  const plain = [];
  const fromByModule = new Map();
  for (const name of used) {
    const [module, member] = IMPORT_SOURCES[name];
    if (member === null) plain.push(`import ${module}`);
    else {
      const members = fromByModule.get(module) ?? new Set();
      members.add(member);
      fromByModule.set(module, members);
    }
  }
  const fromLines = [...fromByModule]
    .sort(([a], [b]) => Number(isStdlibModule(b)) - Number(isStdlibModule(a)) || a.localeCompare(b))
    .map(([module, members]) => `from ${module} import ${[...members].sort().join(", ")}`);
  const stdlib = [...plain.sort(), ...fromLines.filter((l) => !l.startsWith("from pydantic"))];
  const thirdParty = fromLines.filter((l) => l.startsWith("from pydantic"));
  return thirdParty.length ? [...stdlib, "", ...thirdParty] : stdlib;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** BiasReportRequest + window -> BiasReportRequestWindow (stable schema id -> class name). */
function nestedClassName(parent, field) {
  return parent + capitalize(field);
}

function pyStringLiteral(value) {
  const text = String(value);
  return text.includes('"') && !text.includes("'") ? `'${text}'` : `"${text.replace(/"/g, '\\"')}"`;
}

/** Pydantic Field(...) constraint args for a schema; registers the Field import when used. */
function fieldConstraintArgs(schema, imports, dropPattern) {
  const args = [];
  if (schema.minLength !== undefined) args.push(`min_length=${schema.minLength}`);
  if (schema.maxLength !== undefined) args.push(`max_length=${schema.maxLength}`);
  if (schema.pattern !== undefined && !dropPattern) {
    args.push(`pattern=r${pyStringLiteral(schema.pattern)}`);
  }
  if (schema.minimum !== undefined && schema.minimum !== -SAFE_INT)
    args.push(`ge=${schema.minimum}`);
  if (schema.maximum !== undefined && schema.maximum !== SAFE_INT)
    args.push(`le=${schema.maximum}`);
  if (args.length) imports.add("Field");
  return args;
}

class Emitter {
  constructor() {
    /** { name, lines } in emission order; nested classes land before their users. */
    this.classes = [];
    this.imports = new Set(["BaseModel"]);
  }

  objectClass(schema, name) {
    if (schema.properties === undefined) {
      throw new Error(`${name}: object schema without properties is not supported`);
    }
    if (this.classes.some((c) => c.name === name)) {
      throw new Error(`${name}: duplicate class name in one generated module`);
    }
    const required = new Set(schema.required ?? []);
    const fieldLines = [];
    let aliased = false;
    for (const [field, propSchema] of Object.entries(schema.properties)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
        throw new Error(`${name}.${field}: not a valid Python identifier`);
      }
      const pyName = pythonFieldName(field);
      if (pyName !== field) aliased = true;
      const formatted = PY_FORMAT_TYPES[propSchema.format];
      let type = this.typeExpr(propSchema, nestedClassName(name, field));
      if (!required.has(field) && !type.endsWith("| None")) type = `${type} | None`;
      const constraintArgs = fieldConstraintArgs(
        propSchema,
        this.imports,
        formatted?.dropPattern === true,
      );
      if (pyName !== field) {
        this.imports.add("Field");
        const args = [`alias=${pyStringLiteral(field)}`, ...constraintArgs];
        if (!required.has(field)) args.push("default=None");
        fieldLines.push(`    ${pyName}: ${type} = Field(${args.join(", ")})`);
      } else if (required.has(field)) {
        fieldLines.push(
          `    ${pyName}: ${type}${constraintArgs.length ? ` = Field(${constraintArgs.join(", ")})` : ""}`,
        );
      } else {
        if (constraintArgs.length) this.imports.add("Field");
        fieldLines.push(
          `    ${pyName}: ${type}${constraintArgs.length ? ` = Field(${constraintArgs.join(", ")}, default=None)` : " = None"}`,
        );
      }
    }
    const lines = [`class ${name}(BaseModel):`];
    if (aliased) {
      this.imports.add("ConfigDict");
      this.imports.add("Field");
      // Aliased (keyword) fields serialize by their wire name, not the Python one.
      lines.push(
        "    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)",
        "",
      );
    }
    lines.push(...(fieldLines.length ? fieldLines : ["    pass"]));
    this.classes.push({ name, lines });
    return name;
  }

  /** A Python type annotation for one JSON Schema node. */
  typeExpr(schema, nameHint) {
    if (schema.$ref || schema.$defs) {
      throw new Error(`${nameHint}: $ref/$defs are not supported — keep contracts inline`);
    }
    if (schema.anyOf) {
      const rest = schema.anyOf.filter((s) => s.type !== "null");
      const hasNull = rest.length < schema.anyOf.length;
      if (hasNull && rest.length === 1) return `${this.typeExpr(rest[0], nameHint)} | None`;
      throw new Error(`${nameHint}: anyOf beyond a single nullable member is not supported`);
    }
    if (schema.const !== undefined) {
      this.imports.add("Literal");
      if (typeof schema.const === "boolean") return `Literal[${schema.const ? "True" : "False"}]`;
      return `Literal[${pyStringLiteral(schema.const)}]`;
    }
    if (schema.enum) {
      this.imports.add("Literal");
      if (!schema.enum.every((v) => typeof v === "string")) {
        throw new Error(`${nameHint}: only string enums are supported`);
      }
      return `Literal[${schema.enum.map(pyStringLiteral).join(", ")}]`;
    }
    switch (schema.type) {
      case "object":
        return this.objectClass(schema, nameHint);
      case "array":
        if (!schema.items) throw new Error(`${nameHint}: array without items is not supported`);
        return `list[${this.typeExpr(schema.items, `${nameHint}Item`)}]`;
      case "string": {
        const formatted = PY_FORMAT_TYPES[schema.format];
        if (formatted) {
          for (const name of formatted.imports) this.imports.add(name);
          return formatted.type;
        }
        return "str";
      }
      case "integer":
        return "int";
      case "number":
        return "float";
      case "boolean":
        return "bool";
      case "null":
        return "None";
      case undefined:
        // {} — zod's z.unknown(): anything goes.
        if (Object.keys(schema).length === 0) {
          this.imports.add("Any");
          return "Any";
        }
        throw new Error(`${nameHint}: unsupported schema ${JSON.stringify(schema)}`);
      default:
        throw new Error(`${nameHint}: unsupported type ${JSON.stringify(schema.type)}`);
    }
  }
}

/** One generated .py module: header, imports, then every model (nested first). */
function generateModuleFile(sourceModule, entries, schemas) {
  const emitter = new Emitter();
  const schemaIds = [];
  for (const entry of entries) {
    emitter.typeExpr(schemas.get(entry.id), entry.id);
    schemaIds.push(entry.id);
  }
  const header = [
    '"""' + `${GENERATOR_NOTE}.`,
    "",
    `Source: ${sourceModule}`,
    `Schemas: ${schemaIds.join(", ")}`,
    '"""',
    "",
    "from __future__ import annotations",
    "",
    ...importLines(emitter.imports),
    "",
    "",
    "",
  ];
  const body = emitter.classes.map((c) => c.lines.join("\n")).join("\n\n\n");
  return `${header.join("\n")}${body}\n`;
}

/* ------------------------------------------------------------- entry points */

async function buildOutputs() {
  const outputs = new Map(); // abs path -> content
  for (const [module, entries] of groupByModule(manifest)) {
    const schemas = new Map();
    for (const entry of entries) {
      const schema = await loadSchemaExport(entry);
      schemas.set(entry.id, z.toJSONSchema(schema, { io: "input" }));
    }
    const serviceDir = join(REPO_ROOT, "services", entries[0].service);
    const genDir = join(serviceDir, "app", "contracts_gen");
    // The last path segment of the module, without .ts — dots and dashes are
    // not valid in Python module names (ai-callback.contract.ts -> ai_callback_contract).
    const fileStem = module
      .split("/")
      .pop()
      .replace(/\.ts$/, "")
      .replaceAll(".", "_")
      .replaceAll("-", "_");
    outputs.set(join(genDir, `${fileStem}.py`), generateModuleFile(module, entries, schemas));
    outputs.set(
      join(genDir, "__init__.py"),
      `"""${GENERATOR_NOTE}.\n\nPydantic twins of the zod contracts (refactor plan Phase 9 rule 5).\n"""\n`,
    );
  }
  return outputs;
}

async function main() {
  const check = process.argv.includes("--check");
  const outputs = await buildOutputs();
  const drifted = [];
  for (const [path, content] of outputs) {
    if (!check) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
      console.log(`wrote ${path.replace(`${REPO_ROOT}/`, "")}`);
      continue;
    }
    const onDisk = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (onDisk !== content) drifted.push(path.replace(`${REPO_ROOT}/`, ""));
  }
  if (check && drifted.length) {
    console.error(
      `Generated contracts drifted from disk (${drifted.join(", ")}).\n` +
        "Run: bun tools/contracts/generate.mjs",
    );
    process.exit(1);
  }
  console.log(
    check
      ? `contract check ok (${outputs.size} generated files match disk)`
      : `generated ${outputs.size} files for ${manifest.length} contracts`,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(2);
  },
);
