-- Internal service tokens (Phase 9, 0094): one bearer token per Python service for
-- the AI callback (POST /api/internal/ai). Stored through encryptSecret;
-- rotation appends to audit_log. Platform-scoped — no org_id: a service token
-- authenticates a service, never a tenant. Additive and idempotent.
-- Roll: node scripts/migrate-pg.mjs
create table if not exists service_tokens (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  token_encrypted text not null,
  allowed_features jsonb not null default '[]'::jsonb,
  rotated_at timestamptz not null default now(),
  rotated_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists service_tokens_service_key on service_tokens (service);
