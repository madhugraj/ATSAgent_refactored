(Saved from reviewer summary, see conversation.) Key points:

- Pure kernel: context.ts, injection.ts, hitl.ts, run-messages.ts. DB-only kernel: policy.ts, registry.ts (refusal regex line 127), manifest.server.ts, task-liveness.ts.
- events.ts dynamic-imports orchestrator.kickAgents -> hidden cycle. Fix: kernel inserts event row + calls a registered hook.
- runtime.server.ts imports ~12 domains; orchestrator, health, definitions (voice prompts), tools-* are top-layer.
- Replacement: context/policy/events -> agent-kernel; injection -> ai next to untrusted(); runtime(13)/orchestrator(6) calls -> AgentPort {enqueue,cancel,erase,kick}; agents*.functions -> agents package.
- Desk: domains only use conversationForRequisition/ForSubject + postMessage (~15 lines) -> desk-core.notifyRequisitionThread. Split desk into desk-core (low) and desk (top: intake/lifecycle/candidates/run-bridge/progress).
- Voice: own SIP/RTP/UDP; worker.ts polls 15s, built by build-voice-worker.mjs -> .output/voice-worker/index.mjs, separate process. Imports ../agents -> bundles nearly whole server. -> apps/voice-worker. AGENT_INLINE_KICK=0 must survive.
- ai_interviewer = Python POC, not prod; whole folder gitignored (.gitignore line 50), never committed; keep ignore rule.
- agents.lock.json = {type:{version,hash}} sha256 of manifest content, no paths. Update imports in agents-lock.ts & agent-governance.test.ts; expect empty diff; no formatter on prompts.
- Tests use mock.module("../src/...") relative paths -> silently stop mocking after move. Real AI only in agent-eval.ts (EVAL_PROVIDER/KEY/MODEL), negotiation-live-sim, voice-spike (dials phone).
- Risks: duplicated kernel instance breaks AsyncLocalStorage attribution/registry; agent-tick limiter; desk message ordering; health depends on voice graders/redteam/slo -> not kernel.
