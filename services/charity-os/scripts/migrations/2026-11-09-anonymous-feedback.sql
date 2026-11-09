-- Feedback adds one closed kind to the existing anonymous intake queue.
ALTER TABLE os_publications DROP CONSTRAINT IF EXISTS os_publications_kind_check;
ALTER TABLE os_publications ADD CONSTRAINT os_publications_kind_check
 CHECK(kind IN ('contact','event-interest','volunteer-interest','feedback'));
ALTER TABLE os_publications DROP CONSTRAINT IF EXISTS os_publications_feedback_no_target;
ALTER TABLE os_publications ADD CONSTRAINT os_publications_feedback_no_target
 CHECK(kind<>'feedback' OR (target_id IS NULL AND target_module IS NULL AND target_revision IS NULL));
-- Required additive index for one local immutable draft acceptance per intake row.
CREATE UNIQUE INDEX IF NOT EXISTS os_feedback_intake_conversion
 ON os_events(org_id,(detail->>'intakeId')) WHERE action='intake.feedback-converted';
