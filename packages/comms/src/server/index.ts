import "@tanstack/react-start/server-only";

// @ats/comms/server — email templates, send-email, outbox, settings, ics,
// inbound-mail transport. The inbound transport + onInboundMail(handler)
// registry live here (map §11 ruling 4a); the app's CV/documents handler
// registers in boot.ts. The email-outbox move follows (ruling 4c).
export * from "./inbound.server";
