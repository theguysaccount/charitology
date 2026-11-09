import { fail } from "./security.mjs";
import { SUBSTITUTION_RECEIPT_FORMAT } from "./volunteer-substitution-receipt.mjs";
import { SUBSTITUTION_RECOVERED_REPORT_FORMAT } from "./volunteer-substitution-native.mjs";

const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const selector = value => id(value) ? value : null;
const unavailable = () => fail(503, "substitution_source_check", "The saved shift handoff could not be checked.");
const retained = () => fail(409, "substitution_source_retained",
  "A saved shift handoff needs this record and its original links. You can still edit its other details.");

// An accepted receipt identifies the shift and two assignments directly.
// Follow only the exact same-tenant participation and intake edges for
// Contacts and Forms. No answers, account links or authority data are read.
export const VOLUNTEER_SUBSTITUTION_RETENTION_SQL = `
  /*volunteer-substitution:retention*/
  WITH sources AS (
    SELECT r.org_id,r.payload#>>'{history,shift,id}' AS shift_id,
      leg.participation_id,leg.assignment_id
    FROM os_reports r
    CROSS JOIN LATERAL (VALUES
      (r.payload#>>'{history,outgoing,participationId}',r.payload#>>'{history,outgoing,assignmentId}'),
      (r.payload#>>'{history,replacement,participationId}',r.payload#>>'{history,replacement,assignmentId}')
    ) AS leg(participation_id,assignment_id)
    WHERE r.org_id=$1 AND r.payload->>'format'=ANY($8::text[])
  )
  SELECT EXISTS(
    SELECT 1 FROM sources s
    LEFT JOIN os_participations p ON p.org_id=s.org_id AND p.id=s.participation_id
      AND p.module_id='volunteers' AND p.target_id=s.shift_id AND p.booking_record_id=s.assignment_id
    LEFT JOIN os_intake i ON i.org_id=p.org_id AND i.id=p.intake_id
    LEFT JOIN os_publications f ON f.org_id=i.org_id AND f.id=i.publication_id
      AND f.kind='volunteer-interest' AND f.target_module='volunteers' AND f.target_id=s.shift_id
    WHERE (s.shift_id=$2 AND ($3::boolean OR $4::text IS DISTINCT FROM 'volunteers' OR $5::text IS DISTINCT FROM 'shift'))
      OR (s.assignment_id=$2 AND ($3 OR $4 IS DISTINCT FROM 'volunteers' OR $5 IS DISTINCT FROM 'assignment'
        OR $6::text IS DISTINCT FROM s.shift_id OR $7::text IS DISTINCT FROM p.contact_id OR p.id IS NULL))
      OR (p.contact_id=$2 AND ($3 OR $4 IS DISTINCT FROM 'contacts'))
      OR (f.record_id=$2 AND ($3 OR $4 IS DISTINCT FROM 'forms' OR $5 IS DISTINCT FROM 'form'))
  ) AS blocked
`;

/** Caller already owns the shared tenant transaction lock. This guard
 * applies to the records required by accepted live and recovered history. */
export async function guardVolunteerSubstitutionRecord(c, record, { operation = "save" } = {}) {
  if (!id(record?.orgId) || !id(record?.id) || !["save", "delete", "restore"].includes(operation))
    unavailable();
  const result = await c.query(VOLUNTEER_SUBSTITUTION_RETENTION_SQL, [
    record.orgId, record.id, operation === "delete", selector(record.moduleId),
    selector(record.data?.kind), selector(record.data?.shiftId), selector(record.data?.contactId),
    [SUBSTITUTION_RECEIPT_FORMAT, SUBSTITUTION_RECOVERED_REPORT_FORMAT],
  ]);
  if (result?.rowCount !== 1 || result.rows?.length !== 1 || typeof result.rows[0]?.blocked !== "boolean")
    unavailable();
  if (result.rows[0].blocked) retained();
}
