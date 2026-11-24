/**
 * Server environment — validated once at import, so a misconfigured deployment
 * fails fast at boot instead of deep inside a request path.
 *
 * Only DATABASE_URL and SESSION_SECRET are required. Authentication is the
 * first-party cookie session (server/identity.ts) — no external identity
 * provider is consulted.
 */
import { z } from "zod";

const schema = z.object({
  // Database (required)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Sessions
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

  // Public origin (capture endpoint links, OAuth redirects, emails)
  PUBLIC_SITE_URL: z.string().url().default("https://atsiq.yavar.ai"),

  // AI providers: strictly bring-your-own-key per organisation. Keys are stored
  // encrypted in ai_provider_credentials — no deployment-level AI key exists.

  // Social scoring
  GITHUB_TOKEN: z.string().optional(),

  // LinkedIn one-time-connect (org-level OAuth)
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_REDIRECT_URI: z.string().optional(),
  LINKEDIN_SCOPES: z.string().optional(),
  LINKEDIN_STATE_SECRET: z.string().optional(),

  // Meeting-provider delegated OAuth (one-click Connect on the Integrations page)
  OAUTH_STATE_SECRET: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_ID: z.string().optional(),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALENDAR_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET: z.string().optional(),
  ZOOM_OAUTH_CLIENT_ID: z.string().optional(),
  ZOOM_OAUTH_CLIENT_SECRET: z.string().optional(),

  // Careers-inbox webhook receiver
  INBOUND_EMAIL_SECRET: z.string().optional(),
  INBOUND_EMAIL_DOMAIN: z.string().optional(),

  // Google OAuth sign-in (optional; password sign-in always available)
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),

  // Scheduled jobs (in-process cron; bearer for the two /api/public job routes)
  CRON_SECRET: z.string().optional(),

  // Extra approved job-board API hosts for integration base URLs (comma-separated)
  INTEGRATION_ALLOWED_HOSTS: z.string().optional(),

  // SMTP / transactional email
  SMTP_URL: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Google for Jobs: a service account (JSON key, raw or base64) that owns the
  // PUBLIC_SITE_URL property in Search Console. Unset = roles are still listed
  // through the structured data on their apply page; Google finds them on its
  // own crawl instead of being told. The quota is shared by every organisation.
  GOOGLE_INDEXING_CREDENTIALS: z.string().optional(),
  GOOGLE_INDEXING_DAILY_LIMIT: z.coerce.number().int().min(1).max(100_000).default(180),

  // CV vault (S3-compatible; MinIO in development compose)
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("resumes"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  // Phone screening (docs/voice-screening-agent.md): the PBX extension the voice
  // worker dials out from. Unset = phone screening is unavailable. The voice
  // model itself uses each organisation's own credential, never one here.
  // Trimmed: an env file saved with CRLF line endings left a "\r" in each value,
  // and the PBX silently dropped every request built from them.
  SIP_SERVER: z.string().trim().optional(),
  SIP_PORT: z.coerce.number().int().min(1).max(65_535).default(5060),
  SIP_USER: z.string().trim().optional(),
  SIP_PASSWORD: z.string().trim().optional(),
  SIP_AUTH_USER: z.string().trim().optional(),
  SIP_DOMAIN: z.string().trim().optional(),
  SIP_CALLER_NAME: z.string().trim().max(40).optional(),
  // Only when calls have one-way audio behind NAT.
  SIP_PUBLIC_IP: z.string().trim().optional(),
  // Calls the voice worker holds at once (the PBX's channel limit).
  VOICE_MAX_CONCURRENT: z.coerce.number().int().min(1).max(20).default(2),
});

// Some hosts expose the plain Postgres connection string under a different
// variable name (DB_URL); accept that alias so the server boots there too.
// This is a standard Postgres DSN — Drizzle connects directly, no vendor SDK.
const parsed = schema.safeParse({
  ...process.env,
  DATABASE_URL: process.env["DATABASE_URL"] ?? process.env["DB_URL"],
});
if (!parsed.success) {
  const missing = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid server environment:\n${missing.join("\n")}`);
}

// A configured OAuth provider without a state-signing secret would silently
// fall back to forgeable state — refuse to boot in that state instead.
{
  const e = parsed.data;
  const hasStateSecret = Boolean(e.OAUTH_STATE_SECRET ?? e.LINKEDIN_STATE_SECRET);
  const problems: string[] = [];
  if (e.LINKEDIN_CLIENT_ID && e.LINKEDIN_CLIENT_SECRET && !hasStateSecret) {
    problems.push(
      "LINKEDIN_CLIENT_ID is set but neither LINKEDIN_STATE_SECRET nor OAUTH_STATE_SECRET is (min 32 chars).",
    );
  }
  const meetingProvider =
    (e.MICROSOFT_OAUTH_CLIENT_ID && "MICROSOFT_OAUTH_CLIENT_ID") ??
    (e.GOOGLE_CALENDAR_OAUTH_CLIENT_ID && "GOOGLE_CALENDAR_OAUTH_CLIENT_ID") ??
    (e.ZOOM_OAUTH_CLIENT_ID && "ZOOM_OAUTH_CLIENT_ID");
  if (meetingProvider && !e.OAUTH_STATE_SECRET) {
    problems.push(`${meetingProvider} is set but OAUTH_STATE_SECRET is not (min 32 chars).`);
  }
  if (e.SIP_SERVER && !(e.SIP_USER && e.SIP_PASSWORD)) {
    problems.push("SIP_SERVER is set but SIP_USER and SIP_PASSWORD are not both set.");
  }
  if (problems.length) {
    throw new Error(`Invalid server environment:\n${problems.join("\n")}`);
  }
}

export const env = parsed.data;

/** True when the voice worker has a PBX extension to dial out from. */
export function sipConfigured(): boolean {
  return Boolean(env.SIP_SERVER && env.SIP_USER && env.SIP_PASSWORD);
}

/** True when the org-level LinkedIn connect can run. */
export function linkedinEnvConfigured(): boolean {
  return Boolean(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET);
}

/**
 * Per-app views of the same environment (Phase 2 config change): each app
 * validates only the fields its process needs, picked from the combined
 * `schema` above so the field definitions can never drift apart. The web app
 * keeps parsing the combined schema as `env` — behaviour unchanged.
 */
export const webEnv = schema.pick({
  DATABASE_URL: true,
  SESSION_SECRET: true,
  PUBLIC_SITE_URL: true,
  GITHUB_TOKEN: true,
  LINKEDIN_CLIENT_ID: true,
  LINKEDIN_CLIENT_SECRET: true,
  LINKEDIN_REDIRECT_URI: true,
  LINKEDIN_SCOPES: true,
  LINKEDIN_STATE_SECRET: true,
  OAUTH_STATE_SECRET: true,
  MICROSOFT_OAUTH_CLIENT_ID: true,
  MICROSOFT_OAUTH_CLIENT_SECRET: true,
  GOOGLE_CALENDAR_OAUTH_CLIENT_ID: true,
  GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET: true,
  ZOOM_OAUTH_CLIENT_ID: true,
  ZOOM_OAUTH_CLIENT_SECRET: true,
  INBOUND_EMAIL_SECRET: true,
  INBOUND_EMAIL_DOMAIN: true,
  GOOGLE_OAUTH_CLIENT_ID: true,
  GOOGLE_OAUTH_CLIENT_SECRET: true,
  CRON_SECRET: true,
  INTEGRATION_ALLOWED_HOSTS: true,
  SMTP_URL: true,
  EMAIL_FROM: true,
  GOOGLE_INDEXING_CREDENTIALS: true,
  GOOGLE_INDEXING_DAILY_LIMIT: true,
  S3_ENDPOINT: true,
  S3_REGION: true,
  S3_BUCKET: true,
  S3_ACCESS_KEY_ID: true,
  S3_SECRET_ACCESS_KEY: true,
});

// The voice worker: its DB access (call claims, heartbeats) plus the PBX
// extension it dials out from. The cross-field checks above still police the
// SIP_* ↔ OAUTH_STATE_SECRET combinations on the combined parse.
export const voiceEnv = schema.pick({
  DATABASE_URL: true,
  SIP_SERVER: true,
  SIP_PORT: true,
  SIP_USER: true,
  SIP_PASSWORD: true,
  SIP_AUTH_USER: true,
  SIP_DOMAIN: true,
  SIP_CALLER_NAME: true,
  SIP_PUBLIC_IP: true,
  VOICE_MAX_CONCURRENT: true,
});

// The parser worker holds no database or organisation secrets (map §4 L5):
// it reads its own PORT / PARSER_TOKEN / PARSE_LIMIT_MS raw in the worker,
// and those join the schema in a later slice, so it picks nothing today.
export const parserEnv = schema.pick({});
