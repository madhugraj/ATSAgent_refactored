/**
 * dependency-cruiser rules from boundary-map §5. Phase 1 baseline: everything
 * still lives in apps/web (no @ats/* packages exist yet), so the @ats/* rules
 * are vacuous but armed. Each package's PR set flips its rules to error
 * (plan, standard recipe step 5) — until then everything is warn.
 *
 * Layer order (§4): config std observability security storage db
 *   → auth audit platform-http ai kernel
 *   → org legal comms integrations desk-core
 *   → requisitions candidates pipeline matching interviews offers onboarding distribution
 *   → agents desk voice analytics workspace → apps.
 */
const L0 = [
  "@ats/config",
  "@ats/std",
  "@ats/observability",
  "@ats/security",
  "@ats/storage",
  "@ats/db",
];
const L1 = ["@ats/audit", "@ats/auth", "@ats/platform-http", "@ats/ai", "@ats/kernel"];
const L2 = ["@ats/org", "@ats/legal", "@ats/comms", "@ats/integrations", "@ats/desk-core"];
const L3 = [
  "@ats/requisitions",
  "@ats/candidates",
  "@ats/pipeline",
  "@ats/matching",
  "@ats/interviews",
  "@ats/offers",
  "@ats/onboarding",
  "@ats/distribution",
];
const L4 = ["@ats/agents", "@ats/desk", "@ats/voice", "@ats/analytics", "@ats/workspace"];
const LAYERS = [...L0, ...L1, ...L2, ...L3, ...L4];
const layerOf = (p) =>
  L0.includes(p)
    ? 0
    : L1.includes(p)
      ? 1
      : L2.includes(p)
        ? 2
        : L3.includes(p)
          ? 3
          : L4.includes(p)
            ? 4
            : 99;

/** §4 L3 chain: left may be imported by right (index order). */
const L3_ORDER = [
  "requisitions",
  "candidates",
  "pipeline",
  "matching",
  "interviews",
  "offers",
  "onboarding",
];
const allowedInL3 = (from, to) => {
  const f = L3_ORDER.indexOf(from.replace("@ats/", ""));
  const t = L3_ORDER.indexOf(to.replace("@ats/", ""));
  if (f === -1 || t === -1) return true; // not in the chain (e.g. distribution) — other rules apply
  return f < t;
};

module.exports = {
  forbidden: [
    // §5.1/§2 layer rule: no upward imports between @ats packages or into apps.
    {
      name: "layers-no-upward-imports",
      comment: "A package may import only its own layer or lower (map §5.1).",
      severity: "warn",
      from: { path: "^packages/", pathNot: "\\.test\\." },
      to: {
        path: `^packages/(${LAYERS.map((p) => p.replace("@ats/", "")).join("|")})/`,
        pathNot: "^packages/node_modules",
      },
    },
    // §5.2 L3 order: only the §4 chain inside L3.
    {
      name: "l3-chain-order",
      comment: "Inside L3 only the §4 order edges exist (map §5.2).",
      severity: "warn",
      from: { path: `^packages/(${L3_ORDER.join("|")})/` },
      to: { path: `^packages/(${L3_ORDER.join("|")})/` },
    },
    // §5.3 /shared stays browser-safe: no /server imports, no node builtins,
    // no React (split into simple rules so the schema stays happy).
    {
      name: "shared-stays-out-of-server",
      severity: "warn",
      from: { path: "^packages/[^/]+/(src/)?shared/" },
      to: { path: "^packages/[^/]+/(src/)?server/" },
    },
    {
      name: "shared-no-node-builtins",
      severity: "warn",
      from: { path: "^packages/[^/]+/(src/)?shared/" },
      to: { dependencyTypes: ["core"] },
    },
    {
      name: "shared-no-react",
      severity: "warn",
      from: { path: "^packages/[^/]+/(src/)?shared/" },
      to: { path: "node_modules/(react|react-dom|react/jsx-runtime)" },
    },
    // §5.4 domain packages are React-free (ui, comms email templates and apps
    ///web excepted).
    {
      name: "domains-are-react-free",
      severity: "warn",
      from: {
        path: `^packages/(${[...L1, ...L2, ...L3, ...L4].map((p) => p.replace("@ats/", "")).join("|")})/`,
        pathNot: "^packages/comms/src.*(email-templates|ui)/",
      },
      to: { path: "node_modules/(react|react-dom|react/jsx-runtime)" },
    },
    // §5.8 web UI (outside server-fns/ and routes/api/) imports only /shared,
    // ui and server-function files.
    {
      name: "web-ui-imports-shared-only",
      severity: "warn",
      from: {
        path: "^apps/web/src/(routes|components|features|app|hooks)/",
        pathNot: "^apps/web/src/routes/api/",
      },
      to: { path: "^packages/[^/]+/(src/)?server/" },
    },
    // §5.9 no cycles.
    {
      name: "no-cycles",
      severity: "warn",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Resolved from apps/web, where depcruise runs.
    tsConfig: { fileName: "tsconfig.json" },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
