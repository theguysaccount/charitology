// Explicit fictional SELECT measurement fixture; no database/network execution.
import assert from 'node:assert/strict';
// Closed database catalog fixture, independently declared rather than read from
// the module under test. Any future schema change needs an explicit test update.
const catalog = {
  os_participation_groups: 'org_id id origin_mode module_id live_target_id roster_ids coordinator_intake_id state revision last_command_hash history created_at updated_at',
  os_participation_group_receipts: 'org_id command_hash group_id receipt',
  os_participation_checkins: 'org_id id origin_mode revision live_participation_id history report_receipt withdrawn_at withdrawal_receipt created_at updated_at',
  os_records: 'org_id id module_id data status owner_id last_editor_id revision approval snapshot source deleted_at created_at updated_at',
  os_events: 'org_id id actor_id action record_id module_id detail created_at',
  os_integrations: 'org_id id provider name config encrypted_token revision status last_checked_at last_error created_at',
  os_publications: 'org_id id record_id source_revision kind target_id target_module target_revision schema created_by created_at withdrawn_at',
  os_intake: 'org_id id publication_id answers consent_at status revision idempotency_hash payload_hash receipt_hash ip_hash reviewed_by reviewed_at converted_ids created_at updated_at erased_at cancelled_at',
  os_participation_targets: 'org_id target_id module_id revision mode source_revision terms terms_hash recovery_block created_by created_at updated_at last_command',
  os_participations: 'org_id id target_id module_id booking_record_id contact_id intake_id state revision source consent frozen waitlist_sequence confirmed_at cancelled_at created_by created_at updated_at recovered recovered_state last_command delivery_consent requested_interval reminder_consent',
  os_participation_outbox: 'org_id id participation_id event_revision purpose channel state payload created_at participation_revision intent_kind consent_revision consent_copy user_id link_id link_revision recipient_hash policy_epoch template_version relay_key payload_hash first_attempt_at attempts lease_owner lease_until next_at last_checked_at safe_code provider_event_at budget_bytes recovered_state',
  os_participation_delivery_policies: 'org_id revision enabled epoch activated_at template_version last_command updated_at',
  os_task_recurrence_series: 'org_id id root_record_id method anchor state tip_record_id tip_sequence revision created_by created_at ended_at end_code recovered_state budget_bytes last_end_command',
  os_task_recurrence_occurrences: 'org_id series_id sequence source_record_id generated_record_id accepted_command_hash packet',
  os_resource_directory_history: 'org_id id row_kind capture_id binding_id sequence resource_id catalog_kind listing_id origin_mode command_hash request_hash actor_binding_hash payload budget_bytes created_at',
  os_learning_history: 'org_id id row_kind origin_mode origin_org_id binding_id sequence source_version program_id payload receipt budget_bytes created_at',
  os_incubator_history: 'org_id id row_kind origin_mode origin_org_id binding_id sequence source_version program_id payload receipt budget_bytes created_at',
};
const length = value => Buffer.byteLength(JSON.stringify(value));
export function restoreMeasurementFixture() {
  const observed = new Map();
  const query = (sql, args) => {
    if (sql.startsWith('SELECT t.relname AS table_name')) return { rows: Object.entries(catalog).flatMap(([table_name, columns]) => columns.split(' ').map(column_name => ({table_name,column_name}))) };
    if (sql.startsWith('SELECT item.ordinality::integer AS position')) {
      const values = JSON.parse(args[0]), table = sql.match(/NULL::(os_[a-z_]+)/)?.[1];
      if (table) {
        assert.ok(Object.hasOwn(catalog,table)); observed.set(table,values);
        return {rows:values.map((value,i)=>{
          const interval={...value},charged={...value};
          if(table==='os_participations'&&sql.includes("-'requested_interval'")){delete interval.requested_interval;delete charged.requested_interval;}
          if(table==='os_participations'&&sql.includes("-'reminder_consent'"))delete charged.reminder_consent;
          return {position:i+1,bytes:length(charged),raw_bytes:length(value),interval_bytes:length(interval),data_bytes:length(value.data??null),
            ...(table === 'os_participation_groups' ? {history_bytes:length(value.history)} : {})};
        })};
      }
      assert.ok(sql.includes("item.value->'payload'"));
      return {rows:values.map((value,i)=>({position:i+1,payload_bytes:length(value.payload),receipt_bytes:value.receipt===null?0:length(value.receipt)}))};
    }
    return undefined;
  };
  return {observed,query};
}
