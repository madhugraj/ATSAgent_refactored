/**
 * Wire contract for the internal AI callback endpoint (POST /api/internal/ai),
 * used by the Phase 9 Python services.
 *
 * Plan Phase 9 rule 4: no AI provider keys in Python. Any LLM call from a
 * service comes back through this endpoint so the gateway ledger
 * (`ai_usage_events`), spend caps, consent, training capture and vendor
 * stripping all still apply. `tools/contracts/generate.mjs` emits the Pydantic
 * twins consumed by `services/_template/app/ai_client.py`, and
 * `services/_template/tests/test_contracts.py` round-trips the shared golden
 * fixtures through both sides.
 */
import { z } from "zod";

/** The `input` member of a callback request body. */
export const AiCallbackRequest = z.object({
  system: z.string().min(1).max(20_000),
  prompt: z.string().min(1).max(120_000),
  /** Ledger + credential scope (plan Phase 9 rule 3: every request carries orgId). */
  orgId: z.string().uuid(),
});

/** A 200 response body: the gateway result without vendor/model fields. */
export const AiCallbackOk = z.object({
  ok: z.literal(true),
  data: z.unknown(),
  usage: z
    .object({
      promptTokens: z.number().int(),
      completionTokens: z.number().int(),
      totalTokens: z.number().int(),
    })
    .nullable(),
});
