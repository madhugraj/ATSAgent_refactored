-- The AI spend ledger records which Python service made an internal call
-- (refactor plan §9): the internal AI route wraps its gateway call in the
-- service scope, and the ledger writes { service } here. Null for in-app
-- calls. Migration 0095 (phase-3 review follow-up: before 9b's first
-- shadow-mode service runs).
ALTER TABLE ai_usage_events ADD COLUMN metadata jsonb;
