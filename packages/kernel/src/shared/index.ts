// @ats/kernel/shared — browser-safe kernel surface.
// Intentionally empty for now: the event emit and its hook registry, the
// agent/tool registries (which hold the manifest and the gate refusal list),
// autonomy policy, HITL tool contracts and the task-liveness SQL all run
// server-side next to the database, and the client bundle must never pull
// them in. A shared surface (e.g. the event-type list for UI grouping)
// arrives in a later slice.
export {};
