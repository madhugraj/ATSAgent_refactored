import "@tanstack/react-start/server-only";

// @ats/comms/server — email templates, send-email, outbox, settings, ics,
// inbound-mail transport. Empty until the Phase 4 move PR (map §4 L2).
// Change PR planned with the move: onInboundMail(handler) registry; the
// local-inbox transport lands here, its CV/documents handlers move to
// candidates/onboarding and register in boot.ts.
