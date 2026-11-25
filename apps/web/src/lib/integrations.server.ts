/**
 * Server-only integration plumbing.
 *
 * Credentials live in the integration_credentials table, which is never read
 * or written through any client-facing surface — only this module and the
 * requireOrg-gated server functions in integrations.functions.ts reach it.
 */
import { env } from "../server/env";

// SHIM: remove in Phase 8 — the generic credential store moved to
// @ats/org/server (Phase 4, map §4 L2); this re-export keeps the provider
// modules and the requireOrg-gated server functions on the old import. This
// also retires the temporary readSecrets cycle accepted in map §11 ruling 5:
// the app and the (later) integrations package now both import the store
// downward from org.
import { assertIntegrationBaseUrl, type IntegrationConfig } from "@ats/org/server";

export {
  readSecrets,
  writeSecrets,
  clearSecrets,
  assertIntegrationBaseUrl,
  type IntegrationConfig,
} from "@ats/org/server";

export type ProviderId =
  "linkedin" | "naukri" | "indeed" | "github" | "careers" | "zoom" | "google_meet" | "teams";

export type TestOutcome = {
  status: "ok" | "pending" | "failed";
  message: string;
};

/* --------------------------------------------------------- provider tests */

async function testGithub(secrets: Record<string, string>): Promise<TestOutcome> {
  const token = secrets["token"] ?? env.GITHUB_TOKEN ?? "";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "atsiq",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  try {
    const res = await fetch("https://api.github.com/rate_limit", { headers });
    const body = (await res.json()) as { rate?: { limit?: number; remaining?: number } };
    if (!res.ok) return { status: "failed", message: `GitHub returned ${res.status}.` };
    const limit = body.rate?.limit ?? 0;
    return {
      status: "ok",
      message: token
        ? `Authenticated. ${body.rate?.remaining ?? "?"}/${limit} requests remaining this hour.`
        : `Anonymous access working (${limit} req/hour). Add a token to raise the limit to 5000.`,
    };
  } catch (e) {
    return { status: "failed", message: `GitHub unreachable: ${(e as Error).message}` };
  }
}

async function testTokenEndpoint(
  provider: string,
  secrets: Record<string, string>,
  config: IntegrationConfig,
  required: string[],
): Promise<TestOutcome> {
  const missing = required.filter((k) => !secrets[k]);
  if (missing.length)
    return { status: "pending", message: `Missing credential(s): ${missing.join(", ")}.` };

  const baseUrl =
    typeof config["base_url"] === "string" ? (config["base_url"] as string).trim() : "";
  if (!baseUrl)
    return {
      status: "pending",
      message: `Credentials stored. Add the ${provider} API base URL from your partner onboarding pack to verify the connection.`,
    };

  try {
    const base = assertIntegrationBaseUrl(baseUrl);
    // Same path resolution as the board adapters (src/server/boards/partner.ts):
    // the test must verify the exact handshake publishing and polling will use.
    const tokenPath =
      typeof config["token_path"] === "string" && config["token_path"].trim()
        ? config["token_path"].trim()
        : "/oauth/token";
    const res = await fetch(`${base}${tokenPath.startsWith("/") ? tokenPath : `/${tokenPath}`}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: secrets["client_id"] ?? secrets["api_key"] ?? "",
        client_secret: secrets["client_secret"] ?? "",
      }),
    });
    // Reflect the status only — upstream bodies could echo internal details.
    return res.ok
      ? { status: "ok", message: `${provider} token endpoint accepted the credentials.` }
      : { status: "failed", message: `${provider} returned ${res.status}.` };
  } catch (e) {
    return { status: "failed", message: `${provider} test failed: ${(e as Error).message}` };
  }
}

export async function testProvider(
  provider: ProviderId,
  secrets: Record<string, string>,
  config: IntegrationConfig,
): Promise<TestOutcome> {
  switch (provider) {
    case "github":
      return testGithub(secrets);
    case "linkedin":
      return {
        status: "ok",
        message:
          "The LinkedIn account connection is managed on the LinkedIn panel above — no boxes to test here.",
      };
    case "naukri":
      return testTokenEndpoint("Naukri", secrets, config, ["client_id", "client_secret"]);
    case "indeed":
      // Mirrors fetchClientToken in src/server/boards/partner.ts: client_id
      // (api_key accepted as an alias) plus client_secret are both required.
      return testTokenEndpoint("Indeed", secrets, config, ["client_id", "client_secret"]);
    case "careers":
      return { status: "ok", message: "Built-in source — no credentials required." };
    case "zoom":
    case "google_meet":
    case "teams": {
      const { testMeetingProvider } = await import("@ats/integrations/server");
      return testMeetingProvider(provider, secrets);
    }
    default:
      return { status: "failed", message: "Unknown provider." };
  }
}

/* ------------------------------------------------------- candidate import */

export type ExternalCandidate = {
  external_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  experience_years: number;
  education: string | null;
  skills: string[];
  resume_text: string | null;
  linkedin_url: string | null;
  github_url: string | null;
};

/**
 * Pull candidates from a configured job board. Every board requires a partner
 * subscription; without a verified connection we fail loudly rather than
 * fabricating applicants.
 */
export async function importFromProvider(opts: {
  provider: ProviderId;
  secrets: Record<string, string>;
  config: IntegrationConfig;
  keywords: string[];
  experienceMin: number;
  experienceMax: number;
  location: string | null;
  limit: number;
}): Promise<ExternalCandidate[]> {
  const baseUrl =
    typeof opts.config["base_url"] === "string" ? (opts.config["base_url"] as string).trim() : "";

  if (opts.provider === "careers" || opts.provider === "github")
    throw new Error(
      `${opts.provider} is not a searchable resume database. Add candidates from the talent pool or a resume paste.`,
    );

  if (!baseUrl || !Object.keys(opts.secrets).length)
    throw new Error(
      `${opts.provider} is not fully configured. Store the API credentials and the partner API base URL on the Integrations page first.`,
    );

  const token = opts.secrets["access_token"] ?? opts.secrets["api_key"] ?? "";
  const base = assertIntegrationBaseUrl(baseUrl);
  const res = await fetch(`${base}/v1/candidates/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.secrets["account_id"] ? { "X-Account-Id": opts.secrets["account_id"] } : {}),
    },
    body: JSON.stringify({
      keywords: opts.keywords,
      experience: { min: opts.experienceMin, max: opts.experienceMax },
      location: opts.location,
      limit: opts.limit,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.provider} search failed [${res.status}].`);

  let payload: { candidates?: unknown[] } = {};
  try {
    payload = JSON.parse(text) as { candidates?: unknown[] };
  } catch {
    throw new Error(`${opts.provider} returned a non-JSON response.`);
  }

  return (payload.candidates ?? []).map((raw) => {
    const c = raw as Record<string, unknown>;
    return {
      external_id: String(c["id"] ?? c["candidate_id"] ?? crypto.randomUUID()),
      full_name: String(c["name"] ?? c["full_name"] ?? "Unknown"),
      email: String(c["email"] ?? ""),
      phone: (c["phone"] as string | null) ?? null,
      location: (c["location"] as string | null) ?? null,
      experience_years: Number(c["experience_years"] ?? c["total_experience"] ?? 0),
      education: (c["education"] as string | null) ?? null,
      skills: Array.isArray(c["skills"]) ? (c["skills"] as string[]).map(String) : [],
      resume_text: (c["resume_text"] as string | null) ?? null,
      linkedin_url: (c["linkedin_url"] as string | null) ?? null,
      github_url: (c["github_url"] as string | null) ?? null,
    };
  });
}
