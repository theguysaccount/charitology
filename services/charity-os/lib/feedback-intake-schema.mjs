// The old schema remains usable. Show the starter only with both validated
// constraints and the exact local receipt uniqueness rule on this search path.
export async function feedbackIntakeSchemaReady(c) {
  const checks = (await c.query(
    "SELECT conname,contype,convalidated,COALESCE((to_jsonb(k)->>'conenforced')::boolean,true) AS enforced," +
    "pg_get_expr(conbin,conrelid) AS expr FROM pg_constraint k " +
    "WHERE conrelid=to_regclass('os_publications') AND connamespace=to_regnamespace(current_schema()) AND " +
    "conname=ANY(ARRAY['os_publications_kind_check','os_publications_feedback_no_target'])",
  )).rows;
  const expected = {
    os_publications_kind_check: "(kind = ANY (ARRAY['contact'::text, 'event-interest'::text, 'volunteer-interest'::text, 'feedback'::text]))",
    os_publications_feedback_no_target: "((kind <> 'feedback'::text) OR ((target_id IS NULL) AND (target_module IS NULL) AND (target_revision IS NULL)))",
  };
  if (checks.length !== 2 || !checks.every(row => row.contype === "c" &&
      row.convalidated === true && row.enforced === true && row.expr === expected[row.conname])) return false;
  const indexes = (await c.query(
    "SELECT i.indisunique,i.indisvalid,i.indisready,i.indislive,i.indnullsnotdistinct," +
    "pg_get_indexdef(i.indexrelid,0,false) AS definition,quote_ident(n.nspname) AS schema_name " +
    "FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid JOIN pg_namespace n ON n.oid=ix.relnamespace " +
    "WHERE i.indrelid=to_regclass('os_events') AND n.nspname=current_schema() " +
    "AND ix.relname='os_feedback_intake_conversion'",
  )).rows;
  const index = indexes[0];
  return indexes.length === 1 && index.indisunique === true && index.indisvalid === true &&
    index.indisready === true && index.indislive === true && index.indnullsnotdistinct === false &&
    index.definition === "CREATE UNIQUE INDEX os_feedback_intake_conversion ON " + index.schema_name +
      ".os_events USING btree (org_id, ((detail ->> 'intakeId'::text))) WHERE (action = 'intake.feedback-converted'::text)";
}
