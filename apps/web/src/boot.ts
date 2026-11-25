/**
 * Composition root (map §4 L5, §5): the one place that wires the platform
 * packages to the app's implementations. apps/web/src/server.ts imports this
 * first thing, so every registration is in place before the first request is
 * served. This is the only file allowed to import the orchestrator on behalf
 * of the kernel — packages never import upward.
 *
 * The voice worker (server/voice/worker.ts) is a separate entry that never
 * imports this file: it sets AGENT_INLINE_KICK=0 and its events are handled by
 * the app's scheduler, exactly as before the kernel move.
 *
 * This module is imported for side effects only (server.ts: `import "./boot"`),
 * and the app's package.json marks everything else `"sideEffects": false` —
 * so "./src/boot.ts" is listed in that `sideEffects` array. Remove it from the
 * array and rolldown tree-shakes every registration below out of the
 * production build (silently: dev still works). scripts/worker-boot-smoke.sh
 * fails when this file's registrations are missing from the built bundle.
 */
import { onAgentEvent } from "@ats/kernel/server";
import { log, setAgentAlertMailer, setSloNotifier } from "@ats/observability/server";
import { onInboundMail } from "@ats/comms/server";
import { platformAdmins } from "@db/schema";
import { registerDeskThreadEffects } from "@ats/desk-core/server";
import { registerAppAgentPort } from "./agent-port.server";
import { afterSubjectsDeleted, cancelRun } from "./server/agents/runtime.server";

// Load-once assertion for the platform packages (map §5 rule 10): importing
// each server entry here arms its module-level single-instance guard at
// boot, so a duplicated copy anywhere in this bundle fails loudly (throws at
// import) instead of silently splitting the AsyncLocalStorage contexts and
// hook registries.
import "@ats/ai/server";
import "@ats/observability/server";

import { enqueueEmail, formatInOrgTZ, getOrgEmailSettings } from "./lib/email-outbox.server";
import { localInboxHandler } from "./lib/local-inbox.server";
import { sendTemplateEmail } from "./lib/email-templates/send-email";
import { db } from "./server/db";
import { kickAgents } from "./server/agents/orchestrator.server";

// An inserted agent event drains this org's pending events and advances its
// runs right away (the orchestrator's inline kick). kickAgents keeps its own
// guards — it is a no-op in tests and when AGENT_INLINE_KICK=0 — and the
// scheduler (/api/public/agent-tick) remains the source of truth.
onAgentEvent((e) => kickAgents(e.orgId));

// Inbound careers mail: the comms transport (map §11 ruling 4a) resolves the
// tenant and hands each mail to the app's handler here — CV parse into the
// talent pool (intake), pre-onboarding document filing (onboarding),
// job-channel sources. local-inbox.server.ts also registers this same handler
// on import, so the single-slot registry is unchanged either way.
onInboundMail(localInboxHandler);

// Alert e-mail leaves the platform packages through injected callbacks
// (map §4 L0 / §5 "notify (SLO alerts)"): foundation never imports comms.
// Here the app registers its own e-mail stack — same recipients, content,
// outbox keys and cadence as before the observability move; without these
// registrations alert e-mail is simply skipped.
setAgentAlertMailer({ enqueueEmail, getOrgEmailSettings, formatInOrgTZ });

// SLO burn alerts: the same member_reminder e-mail to every platform admin as
// before, gated on the deployment's SMTP relay and deduped by the alert's
// idempotency key; awaited, as before. The returned channels land in the
// alert's audit row; a failed send logs and leaves the e-mail channel out.
setSloNotifier(async (notice) => {
  if (!process.env["SMTP_URL"]) return [];
  const admins = await db.select({ email: platformAdmins.email }).from(platformAdmins);
  let sent = 0;
  for (const a of admins) {
    try {
      await sendTemplateEmail("member_reminder", a.email, {
        idempotencyKey: `slo-alert:${notice.alertId}:${notice.severity}:${a.email.toLowerCase()}`,
        templateData: {
          heading: notice.heading,
          message: notice.message,
          actionUrl: notice.actionUrl,
        },
      });
      sent++;
    } catch (e) {
      log.warn("slo.alert.email_failed", { error: e instanceof Error ? e : String(e) });
    }
  }
  return sent ? ["email"] : [];
});

// Thread deletion in @ats/desk-core stops a chat's agent runs through the
// injected runtime effects (map §4 L2: the store package never imports the
// agents runtime). Same calls, same order as the pre-extraction lazy imports
// in desk.server.ts; desk.server.ts registers the same pair at load so
// direct desk imports (tests) are wired too.
registerDeskThreadEffects({ cancelRun, afterSubjectsDeleted });

// The domains start and stop agent runs through the kernel's AgentPort and
// the org run effects (map §4 L2/§5 "AgentPort.enqueue/kick"): org-context
// starts its build run and org-profile kicks the scheduler through the port,
// and a profile reset stops runs through the injected cancelRun — all the
// same runtime/orchestrator calls the pre-port dynamic imports made, in the
// same order. apps/web/src/lib/org-profile.server.ts registers the same pair
// at load so direct shim imports (tests, server-fn wrappers) are wired too.
registerAppAgentPort();

// Placeholder (later phases): the remaining domain-event (onDomainEvent) and
// subject-deletion (onSubjectsDeleted) subscribers register here.
