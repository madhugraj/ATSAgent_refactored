-- The stage_events trail records WHY a transition happened when the cause
-- silences the candidate-facing effects (interview_scheduled: the invite
-- email covers it; offer: the offer workflow owns the messaging). Nullable —
-- decision moves have no cause. Migration 0096 (Phase 5, change PR 1: the
-- cause parameter on moveStageCore, Dev 2's stage-writers plan order 1).
ALTER TABLE stage_events ADD COLUMN cause text;
