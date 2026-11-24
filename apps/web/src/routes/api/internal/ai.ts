/**
 * POST /api/internal/ai — the internal AI callback for the Phase 9 Python
 * services (refactor plan §9 rule 4: no AI provider keys in Python).
 *
 * A service posts `{feature, input: {system, prompt, orgId}}` with its service
 * token; this route calls the AI gateway exactly like other server code, so
 * the ledger (`ai_usage_events`), spend caps, consent, training capture and
 * vendor stripping all still apply. The forwarded prompt is data-bearing (a
 * parsed CV or JD text the service extracted), so it enters the model only
 * through `untrusted(...)` and the system prompt starts with INJECTION_RULES —
 * the same injection hygiene every other AI call keeps.
 *
 * Defence in depth, in the order it runs:
 *  1. Ingress (production only): any request that carries X-Forwarded-For
 *     gets a bare 404 — in-cluster callers connect directly and carry none,
 *     anything proxied through the public LB does. Infra also denies
 *     /api/internal/* at the LB (apps/web/infra/gke/20-ingress.yaml).
 *  2. Service token (service_tokens row via encryptSecret, or the
 *     SERVICE_TOKENS env bootstrap, deleted after the first rotation),
 *     constant-time compared, generic 401.
 *  3. Body validation against the shared zod contract, 400.
 *  4. Feature allow-list per service token, 403 — always explicit: an empty
 *     list allows nothing.
 *  5. Tenancy: the org must exist and have opted into AI — meaning it has
 *     saved its own AI provider key. That is *AI-use* consent and is separate
 *     from training-capture consent (training_settings), which gates what may
 *     be captured for training, not what may be called. Unknown org and
 *     consent-missing are the same generic 403, so the endpoint cannot be
 *     used to probe which orgs exist.
 * The reply carries no vendor or model names (deep-stripped below).
 */
import { AiCallbackRequest } from "@/lib/ai-callback.contract";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AI_FEATURES } from "@/server/ai-usage";
import {
  internalIngressAllowed,
  orgHasAiConsent,
  resolveServiceToken,
} from "@/server/internal-ai.server";

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

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!/^bearer\s+/i.test(header)) return null;
  const token = header.replace(/^bearer\s+/i, "").trim();
  return token || null;
}

async function handle(request: Request): Promise<Response> {
  if (!internalIngressAllowed(request)) {
    return new Response("Not found", { status: 404, headers: NO_STORE });
  }

  const token = bearerToken(request);
  const auth = token ? await resolveServiceToken(token) : { authorized: false as const };
  if (!token || !auth.authorized) {
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

  // Per-service budget fence (review 9a A1 + follow-up): the allow-list is
  // always explicit — an empty list (env bootstrap without
  // SERVICE_TOKEN_FEATURES, or a token rotated without one) authorises no
  // feature at all.
  if (!auth.allowedFeatures.includes(parsed.data.feature)) {
    return Response.json(
      { ok: false, message: "This service token is not allowed to call this feature." },
      { status: 403, headers: NO_STORE },
    );
  }

  if (!(await orgHasAiConsent(parsed.data.input.orgId))) {
    return Response.json(
      { ok: false, message: "AI is not enabled for this organisation." },
      { status: 403, headers: NO_STORE },
    );
  }

  const { aiJson, INJECTION_RULES, untrusted } = await import("@/lib/ai-gateway.server");
  const result = await aiJson({
    // The service's own instructions, hardened with the injection rules; the
    // forwarded text is data from an external person and enters as such.
    system: `${INJECTION_RULES}\n\n${parsed.data.input.system}`,
    prompt: untrusted("service_input", parsed.data.input.prompt),
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
