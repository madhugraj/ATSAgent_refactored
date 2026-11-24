/**
 * Platform-console management of the internal service tokens (refactor plan
 * Phase 9 rule 8: token rotation goes through writeAudit). The tokens
 * authenticate the Python services against POST /api/internal/ai; the storage,
 * constant-time comparison and ingress rules live in
 * server/internal-ai.server.ts.
 *
 * Platform-admin gated like every other platform.* function, and audited.
 */
import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { db } from "../server/db";
import { serviceTokens } from "@db/schema";
import { requirePlatformAdmin } from "./auth.middleware";
import { rotateServiceToken } from "../server/internal-ai.server";

/** Service names allowed to hold a token — the Phase 9 services. */
const KNOWN_SERVICES = z.enum(["parser", "matching-ml", "analytics-ml", "voice", "_template"]);

export const rotateServiceTokenFn = createServerFn({ method: "POST" })
  .middleware([requirePlatformAdmin])
  .validator((data: unknown) => z.object({ service: KNOWN_SERVICES }).parse(data))
  .handler(async ({ data, context }) => {
    const token = await rotateServiceToken({
      service: data.service,
      actorEmail: context.email,
      actorUserId: context.userId,
    });
    // Shown once — only its encryption lives in the database from here on.
    return { ok: true, token };
  });

export const listServiceTokens = createServerFn({ method: "GET" })
  .middleware([requirePlatformAdmin])
  .handler(async () => {
    const rows = await db
      .select({
        service: serviceTokens.service,
        rotatedAt: serviceTokens.rotatedAt,
        rotatedBy: serviceTokens.rotatedBy,
      })
      .from(serviceTokens)
      .orderBy(desc(serviceTokens.rotatedAt));
    // Never the token itself — metadata only.
    return rows.map((r) => ({
      service: r.service,
      rotatedAt: r.rotatedAt.toISOString(),
      rotatedBy: r.rotatedBy,
    }));
  });
