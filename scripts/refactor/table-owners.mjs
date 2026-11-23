// Checks that every pgTable in the schema has an owner (map §7 + §10
// proposals awaiting reviewer approval at Gate 1). The owner decides which
// package's /server may WRITE; anyone may read.
// Usage: node table-owners.mjs [schema-path]
//   default schema: <repo-root>/apps/web/drizzle/schema.ts
import fs from "node:fs";

const schema =
  process.argv[2] ?? new URL("../../apps/web/drizzle/schema.ts", import.meta.url).pathname;

const s = fs.readFileSync(schema, "utf8");
// pgTable("name", ...) — the name may be followed by a newline before the
// comma, so allow whitespace across lines (map §1 fact).
const tables = [...s.matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]);

/** Owner map from boundary-map §7. */
const OWNERS = {
  auth: ["users", "sessions", "platform_admins", "notification_states"],
  org: [
    "organizations",
    "org_members",
    "user_roles",
    "departments",
    "master_items",
    "org_profiles",
    "org_profile_versions",
    "org_context_sources",
    "content_templates",
    "org_pool_shares",
  ],
  legal: ["org_agreements"],
  platform: ["audit_log", "rate_limit_hits", "service_request_minutes", "slo_alerts"],
  ai: [
    "ai_settings",
    "ai_provider_credentials",
    "ai_usage_events",
    "ai_redteam_checks",
    "training_settings",
    "training_inferences",
    "training_feedback",
    "training_eval_results",
  ],
  requisitions: ["requisitions", "job_descriptions", "role_panels"],
  candidates: [
    "candidates",
    "social_profiles",
    "candidate_notes",
    "candidate_ownership_events",
    "candidate_referrals",
    "talent_requests",
    "talent_request_suggestions",
    "capture_events",
  ],
  pipeline: ["applications", "stage_events"],
  matching: [
    "match_scores",
    "screening_kits",
    "screening_runs",
    "screening_prep_jobs",
    "candidate_verifications",
  ],
  interviews: [
    "interviews",
    "interview_slot_offers",
    "round_substitutes",
    "panelists",
    "member_interviewer_profiles",
    "panelist_scorecard_links",
    "evaluations",
    "interview_transcripts",
    "panel_assessments",
    "panel_agent_settings",
    "ai_interviews",
    "candidate_assessments",
    "assessment_settings",
  ],
  offers: [
    "offers",
    "offer_negotiations",
    "compensation_requests",
    "compensation_details",
    "salary_benchmarks",
    "comp_knowledge",
    "hr_incentive_schemes",
  ],
  onboarding: ["onboarding_documents", "hrms_employees", "hrms_sync_state", "hrms_field_mappings"],
  integrations: ["source_integrations", "integration_credentials", "org_linkedin_connections"],
  comms: ["email_outbox", "email_settings", "inbox_messages"],
  distribution: [
    "requisition_board_postings",
    "org_job_distribution",
    "job_index_notifications",
    "board_webhook_events",
    "board_sync_state",
  ],
  voice: ["screening_calls", "phone_screening_settings", "voice_worker_heartbeat"],
  analytics: ["skill_nodes", "skill_edges", "skill_evidence", "ontology_snapshots"],
  agents: [
    "agent_policies",
    "agent_events",
    "agent_definitions",
    "agent_runs",
    "agent_steps",
    "agent_tasks",
    "agent_metrics_daily",
    "agent_issues",
    "agent_runtime_heartbeat",
    "agent_telemetry_settings",
    "agent_cost_rates",
    "hiring_conversations",
    "hiring_messages",
    "copilot_messages",
    "product_catalogue_commercials",
  ],
  desk: ["demand_outlooks"],
};

/**
 * New tables from #69/#78, proposed by the executor per §10's rule (the
 * writer owns the table; writers verified by grep at dcb6a4b). The reviewer
 * approves these at Gate 1 — until then they are PROPOSED, not final.
 */
const PROPOSED = {
  agents: [
    "agent_blueprints",
    "agent_blueprint_keys",
    "agent_workflows",
    "agent_workflow_versions",
    "agent_workflow_grants",
    "studio_agent_versions",
    "studio_agent_grants",
    "workflow_api_keys",
    "workflow_runs",
  ],
  interviews: ["interview_confirmations", "plan_change_proposals", "scorecard_chases"],
  offers: [
    "pay_zones",
    "pooling_regions",
    "exchange_rates",
    "pay_figures",
    "pay_convention_drafts",
    "policy_sources",
    "policy_reads",
    "policy_briefings",
    "policy_findings",
  ],
  voice: ["call_reviews"],
};

const ownerOf = {};
for (const [owner, list] of [...Object.entries(OWNERS), ...Object.entries(PROPOSED)])
  for (const t of list) ownerOf[t] = owner;

const missing = tables.filter((t) => !ownerOf[t]);
const stale = Object.keys(ownerOf).filter((t) => !tables.includes(t));

console.log(`tables in schema: ${tables.length}`);
const byOwner = {};
for (const t of tables) (byOwner[ownerOf[t] ?? "UNOWNED"] ??= []).push(t);
for (const [owner, list] of Object.entries(byOwner).sort())
  console.log(
    `  ${owner.padEnd(14)} ${String(list.length).padStart(3)}  ${owner === "UNOWNED" ? list.join(" ") : ""}`,
  );

if (stale.length) console.log(`\nlisted-but-absent (typo or dropped table?): ${stale.join(" ")}`);
if (missing.length) {
  console.error(`\n${missing.length} tables have no owner:`);
  for (const t of missing) console.error("  " + t);
  process.exit(1);
}
const proposedCount = tables.filter((t) =>
  Object.keys(PROPOSED).some((o) => PROPOSED[o].includes(t)),
).length;
console.log(`\nok — every table owned (${proposedCount} still PROPOSED, awaiting Gate 1 review)`);
