// Keep request authority in the immutable server event. Ordinary history and
// audit views may show a decision without receiving the local request pins.
export const feedbackSafeAuditDetailSQL =
  "CASE WHEN action='intake.feedback-converted' THEN detail-'requestSha256'-'authoritySha256' ELSE detail END AS detail";

// Used only in the tenant-bound audit query. Quota-reserve events can carry the
// same source selector as targetId, without the richer regular audit detail.
export const scopedFeedbackIntakeAuditSQL = `
  AND NOT (action LIKE 'intake.%' AND (
    action='intake.feedback-converted'
    OR EXISTS (SELECT 1 FROM os_publications p WHERE p.org_id=os_events.org_id AND p.kind='feedback'
      AND p.id IN (os_events.detail->>'publicationId',os_events.detail->>'targetId'))
    OR EXISTS (SELECT 1 FROM os_intake i JOIN os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id
      WHERE i.org_id=os_events.org_id AND p.kind='feedback' AND i.id IN (os_events.detail->>'intakeId',os_events.detail->>'targetId'))
  ))`;
export const scopedFeedbackAuditSQL =
  `AND (record_id IS NULL OR record_id <> ALL($2::text[]))
   AND NOT (action='report.frozen' AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(detail->'sourceRevisions')='array' THEN detail->'sourceRevisions' ELSE '[]'::jsonb END
     ) AS source(revision) WHERE source.revision->>'id'=ANY($2::text[])
   )) ` + scopedFeedbackIntakeAuditSQL;
export const feedbackBackupSQL = `COALESCE(payload->'intake'->'publications' @> '[{"kind":"feedback"}]'::jsonb,false)`;

export async function linkedFeedbackDraftIds(c, org) {
  const { rows } = await c.query(`
    SELECT DISTINCT ref.value->>'id' AS id FROM os_intake i
    JOIN os_publications p ON p.org_id=i.org_id AND p.id=i.publication_id
    CROSS JOIN LATERAL jsonb_array_elements(i.converted_ids) ref(value)
    WHERE i.org_id=$1 AND p.kind='feedback' AND ref.value->>'moduleId'='feedback'
      AND ref.value->>'id' IS NOT NULL`, [org]);
  return new Set(rows.map(row => row.id));
}
