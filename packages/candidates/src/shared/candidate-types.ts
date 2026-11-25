/**
 * Candidate wire types (map §4 L3 candidates shared row: "Candidate types
 * (from lib/data.ts)"). Extracted verbatim from apps/web/src/lib/data.ts,
 * which re-exports them so its importers keep working unchanged.
 */
import type { Tables } from "@ats/db/shared";

export type Candidate = Tables<"candidates">;
