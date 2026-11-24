/**
 * POST /api/internal/ai — the internal AI callback for the Phase 9 Python
 * services (refactor plan §9 rule 4: no AI provider keys in Python).
 *
 * A service posts `{feature, input: {system, prompt, orgId}}` with its service
 * token; this route calls the AI gateway exactly like other server code, so
 * the ledger (`ai_usage_events`), spend caps, consent, training capture and
 * prompt-injection hygiene all still apply. The reply carries no vendor or
 * model names (deep-stripped below) and no database reads happen here — the
 * gateway resolves the org's own credentials itself.
 *
 * Auth is the same SERVICE_TOKENS env the Python side uses (constant-time
 * compare, generic 401). The `/api/internal` prefix is rate-limited in
 * src/server.ts — the prefix is stable, the limiter keys on it.
 */
import { timingSafeEqual } from "node:crypto";

import { AiCallbackRequest } from "@/lib/ai-callback.contract";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AI_FEATURES } from "@/server/ai-usage";

const NO_STORE = { "cache-control": "no-store" } as const;

const Body = z.object({
  feature: z.enum(AI_FEATURES),
  input: AiCallbackRequest,
});

/** Keys that could carry vendor or model identity — never leave the server. */
const VENDOR_KEYS = new Set(["model", "provider", "engine"]);

function stripVendor(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVendor);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (!VENDOR_KEYS.has(key)) out[key] = stripVendor(v);
    }
    return out;
  }
  return value;
}

/** SERVICE_TOKENS — the same comma-separated bootstrap list the services use. */
function tokenMatches(given: string): boolean {
  const tokens = (process.env["SERVICE_TOKENS"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length) return false;
  const a = Buffer.from(given);
  for (const token of tokens) {
    const b = Buffer.from(token);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!/^bearer\s+/i.test(header)) return false;
  return tokenMatches(header.replace(/^bearer\s+/i, "").trim());
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json(
      { ok: false, message: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json(
      { ok: false, message: "Invalid JSON." },
      { status: 400, headers: NO_STORE },
    );
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        message:
          "Invalid request: feature must be an AI_FEATURES slug and input needs system, prompt, orgId.",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const { aiJson } = await import("@/lib/ai-gateway.server");
  const result = await aiJson({
    system: parsed.data.input.system,
    prompt: parsed.data.input.prompt,
    orgId: parsed.data.input.orgId,
    feature: parsed.data.feature,
  });

  if (!result.ok) {
    // The gateway message can quote provider errors (model ids, vendor text) —
    // reply generically; the detail stays in the server logs and ledger.
    return Response.json(
      { ok: false, message: "AI request failed." },
      { status: result.status, headers: NO_STORE },
    );
  }
  return Response.json(stripVendor({ ok: true, data: result.data, usage: result.usage }), {
    status: 200,
    headers: NO_STORE,
  });
}

export const Route = createFileRoute("/api/internal/ai")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
    },
  },
});
