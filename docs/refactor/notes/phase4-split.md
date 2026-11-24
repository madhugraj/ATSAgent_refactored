# Phase 4 split (L2 shared services) — agreed 2026-11-24

Start conditions: Phase 3 merged (Dev 1's packages on main: @ats/audit, @ats/auth, @ats/ai, @ats/kernel,
@ats/platform-http). Developer 2 starts legal/comms/integrations as soon as **@ats/auth and @ats/kernel**
are on main — no need to wait for the whole Phase 3 verdict. Spec: map §4 L2 + plan Phase 4; recipe =
Phase 2/3 standard (skeleton → git mv + marked shims → import rewrites → test moves → package gates).

| Package      | Owner                  | Moves (map §4 L2)                                                                                                                                                                                                              | Change PRs (separate)                                                                                                                     |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| desk-core    | Dev 1 (with org)       | from desk.server.ts: conversation store, conversationForRequisition/ForSubject, postMessage, plainPreview, thread deletion, NEW notifyRequisitionThread()                                                                      | none beyond the extraction; ~50 domain call sites repointed in the same phase, same call position, awaited                                |
| org          | Dev 1 (with desk-core) | org.functions→server, org-profile*, org-context* (1.4k split crawl/extract/summarise/persist), master*, templates*, org-setup, integration-seeds, generic credential store (readSecrets/writeSecrets from integrations.server) | org-profile/org-context start runs through AgentPort (kernel)                                                                             |
| legal        | Dev 2                  | lib/legal/*, org-agreements, LegalSection type from components/LegalPage.tsx → legal/shared                                                                                                                                    | none known                                                                                                                                |
| comms        | Dev 2                  | email-templates (React), send-email, email-outbox, email-settings, ics, mail transport from local-inbox                                                                                                                        | onInboundMail(handler) registry; local-inbox split: transport in comms, CV/documents handlers to candidates/onboarding registered in boot |
| integrations | Dev 2                  | meetings*, meetings-oauth, meeting-transcripts, linkedin*, calendar-availability, provider-specific integrations code                                                                                                          | uses the org credential store                                                                                                             |

Shared-file rule: turbo.json / root package.json / ci.yml / tools/depcruise.cjs / bun.lock changes go
through Dev 1. Depcruise: each package's rules flip warn→error in its own PR set.
Entries you may import (map §4): @ats/{config,std*,observability,security,storage,db} (L0),
@ats/{audit,auth,platform-http,ai,kernel} (L1 — auth + kernel land first; ai's gateway for email templates
only if needed). `std` does not exist yet — its utils stay in apps/web until a later phase; do not create it.
Desk ordering test (plan Gate 4): post a scorecard, then an offer status, assert thread order. Inbound CV
mail e2e: mail → candidate created.
