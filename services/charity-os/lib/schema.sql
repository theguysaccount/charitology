CREATE TABLE IF NOT EXISTS os_orgs (id text PRIMARY KEY,name text NOT NULL,slug text UNIQUE NOT NULL,currency text NOT NULL,time_zone text NOT NULL,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS os_members (org_id text NOT NULL REFERENCES os_orgs(id),user_id text NOT NULL,role text NOT NULL,program_ids jsonb NOT NULL DEFAULT '[]',revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,user_id));
CREATE TABLE IF NOT EXISTS os_records (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,module_id text NOT NULL,data jsonb NOT NULL,status text NOT NULL,owner_id text NOT NULL,last_editor_id text NOT NULL,revision integer NOT NULL,approval jsonb,snapshot jsonb,source jsonb,deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id));
CREATE INDEX IF NOT EXISTS os_records_module ON os_records(org_id,module_id,updated_at DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS os_events (org_id text NOT NULL REFERENCES os_orgs(id),id bigserial,actor_id text NOT NULL,action text NOT NULL,record_id text,module_id text,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id));
CREATE TABLE IF NOT EXISTS os_comments (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,record_id text NOT NULL,actor_id text NOT NULL,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id),FOREIGN KEY(org_id,record_id) REFERENCES os_records(org_id,id));
CREATE TABLE IF NOT EXISTS os_invites (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,email text NOT NULL,role text NOT NULL,program_ids jsonb NOT NULL DEFAULT '[]',token_hash text UNIQUE NOT NULL,created_by text NOT NULL,expires_at timestamptz NOT NULL,accepted_at timestamptz,revoked_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id));
CREATE TABLE IF NOT EXISTS os_previews (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,actor_id text NOT NULL,kind text NOT NULL,payload jsonb NOT NULL,checksum text NOT NULL,base_revision text NOT NULL,expires_at timestamptz NOT NULL,committed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id));
CREATE TABLE IF NOT EXISTS os_reports (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,created_by text NOT NULL,title text NOT NULL,checksum text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id));
CREATE TABLE IF NOT EXISTS os_integrations (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,provider text NOT NULL,name text NOT NULL,config jsonb NOT NULL,encrypted_token text,revision integer NOT NULL DEFAULT 1,status text NOT NULL DEFAULT 'unconfigured',last_checked_at timestamptz,last_error text,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id));
CREATE TABLE IF NOT EXISTS os_files (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,record_id text NOT NULL,name text NOT NULL,mime text NOT NULL,checksum text NOT NULL,bytes bytea NOT NULL,size integer NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id),FOREIGN KEY(org_id,record_id) REFERENCES os_records(org_id,id));
CREATE TABLE IF NOT EXISTS os_jobs (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,kind text NOT NULL,idempotency_key text NOT NULL,payload jsonb NOT NULL,status text NOT NULL DEFAULT 'pending',attempts integer NOT NULL DEFAULT 0,next_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,last_error text,result jsonb,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id),UNIQUE(org_id,idempotency_key));
CREATE TABLE IF NOT EXISTS os_rate_limits (key text PRIMARY KEY,hits integer NOT NULL,expires_at timestamptz NOT NULL);
ALTER TABLE os_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_orgs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_orgs;
CREATE POLICY tenant ON os_orgs USING (id = current_setting('app.org_id',true) OR EXISTS (SELECT 1 FROM os_members m WHERE m.org_id=id AND m.user_id=current_setting('app.user_id',true))) WITH CHECK (id = current_setting('app.org_id',true) OR EXISTS (SELECT 1 FROM os_members m WHERE m.org_id=id AND m.user_id=current_setting('app.user_id',true)));
ALTER TABLE os_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_members;
CREATE POLICY tenant ON os_members USING (org_id=current_setting('app.org_id',true) OR user_id=current_setting('app.user_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true) OR user_id=current_setting('app.user_id',true));
ALTER TABLE os_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_records;
CREATE POLICY tenant ON os_records USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_events;
CREATE POLICY tenant ON os_events USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_comments;
CREATE POLICY tenant ON os_comments USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_invites FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_invites;
CREATE POLICY tenant ON os_invites USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_previews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_previews;
CREATE POLICY tenant ON os_previews USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_reports;
CREATE POLICY tenant ON os_reports USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_integrations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_integrations;
CREATE POLICY tenant ON os_integrations USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_files FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_files;
CREATE POLICY tenant ON os_files USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_jobs;
CREATE POLICY tenant ON os_jobs USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
-- Only opaque tenant identifiers are exposed to the scheduled dispatcher; job payloads remain under tenant RLS.
CREATE TABLE IF NOT EXISTS os_job_tenants (org_id text PRIMARY KEY REFERENCES os_orgs(id));
CREATE OR REPLACE FUNCTION os_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only record'; END $$;
DROP TRIGGER IF EXISTS immutable_events ON os_events;
CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON os_events FOR EACH ROW EXECUTE FUNCTION os_immutable();
DROP TRIGGER IF EXISTS immutable_reports ON os_reports;
CREATE TRIGGER immutable_reports BEFORE UPDATE OR DELETE ON os_reports FOR EACH ROW EXECUTE FUNCTION os_immutable();

CREATE UNIQUE INDEX IF NOT EXISTS os_source_identity ON os_records(org_id,(source->>'integrationId'),(source->>'externalId')) WHERE source IS NOT NULL;
CREATE TABLE IF NOT EXISTS os_uploads (org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,part integer NOT NULL,total integer NOT NULL,actor_id text NOT NULL,bytes bytea NOT NULL,checksum text NOT NULL,expires_at timestamptz NOT NULL,PRIMARY KEY(org_id,id,part));
ALTER TABLE os_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_uploads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_uploads;
CREATE POLICY tenant ON os_uploads USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));

ALTER TABLE os_job_tenants ADD COLUMN IF NOT EXISTS last_run_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z';

-- Public intake has a deliberately separate private queue; generic forms records
-- retain their schema/aggregate semantics. Anonymous requests set one tenant only.
CREATE TABLE IF NOT EXISTS os_publications (
  org_id text NOT NULL REFERENCES os_orgs(id), id text NOT NULL,
  record_id text NOT NULL, source_revision integer NOT NULL CHECK(source_revision>0),
  kind text NOT NULL CHECK(kind IN ('contact','event-interest','volunteer-interest')),
  target_id text, target_module text, target_revision integer,
  schema jsonb NOT NULL, created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz,
  PRIMARY KEY(org_id,id)
);
CREATE TABLE IF NOT EXISTS os_intake (
  org_id text NOT NULL REFERENCES os_orgs(id), id text NOT NULL,
  publication_id text NOT NULL, answers jsonb NOT NULL, consent_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed','converted','cancelled')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  idempotency_hash text, payload_hash text, receipt_hash text UNIQUE, ip_hash text,
  reviewed_by text, reviewed_at timestamptz, converted_ids jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,id), UNIQUE(org_id,publication_id,idempotency_hash),
  FOREIGN KEY(org_id,publication_id) REFERENCES os_publications(org_id,id)
);
CREATE INDEX IF NOT EXISTS os_publications_created ON os_publications(org_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS os_intake_created ON os_intake(org_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS os_intake_queue ON os_intake(org_id,publication_id,status);
ALTER TABLE os_intake ADD COLUMN IF NOT EXISTS erased_at timestamptz;
ALTER TABLE os_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_publications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_publications;
CREATE POLICY tenant ON os_publications USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_intake ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_intake FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_intake;
CREATE POLICY tenant ON os_intake USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));

-- This index exposes only an authenticated user's own opaque access links.
-- Intake answers and publication schemas keep their unchanged tenant policies.
CREATE TABLE IF NOT EXISTS os_participant_links (
  id text NOT NULL UNIQUE CHECK(id ~ '^[a-f0-9]{32}$'),
  org_id text NOT NULL REFERENCES os_orgs(id), intake_id text NOT NULL,
  publication_id text NOT NULL, user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  PRIMARY KEY(user_id,org_id,intake_id), UNIQUE(org_id,intake_id),
  FOREIGN KEY(org_id,intake_id) REFERENCES os_intake(org_id,id),
  FOREIGN KEY(org_id,publication_id) REFERENCES os_publications(org_id,id)
);
CREATE INDEX IF NOT EXISTS os_participant_own ON os_participant_links(user_id,created_at DESC,id DESC);
ALTER TABLE os_participant_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participant_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS participant_own ON os_participant_links;
CREATE POLICY participant_own ON os_participant_links
  USING (user_id=current_setting('app.user_id',true))
  WITH CHECK (user_id=current_setting('app.user_id',true) AND org_id=current_setting('app.org_id',true));
-- Monotonic tenant counter counts revoked grants too without exposing other
-- users' index rows through their own-user RLS policy. Never restored from backup.
CREATE TABLE IF NOT EXISTS os_participant_org_usage (
  org_id text PRIMARY KEY REFERENCES os_orgs(id), total integer NOT NULL DEFAULT 0 CHECK(total BETWEEN 0 AND 1000)
);
ALTER TABLE os_participant_org_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participant_org_usage FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participant_org_usage;
CREATE POLICY tenant ON os_participant_org_usage USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));

-- Request withdrawal is distinct from erasure and future participation consent.
ALTER TABLE os_intake ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Fulfillment is independent of the typed record's working approval state.
CREATE TABLE IF NOT EXISTS os_participation_targets (
  org_id text NOT NULL REFERENCES os_orgs(id), target_id text NOT NULL,
  module_id text NOT NULL CHECK(module_id IN ('events','volunteers')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  mode text NOT NULL DEFAULT 'managed' CHECK(mode IN ('managed','paused')),
  source_revision integer NOT NULL CHECK(source_revision>0),
  terms jsonb NOT NULL, terms_hash text NOT NULL,
  recovery_block boolean NOT NULL DEFAULT false,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), last_command jsonb,
  PRIMARY KEY(org_id,target_id),
  FOREIGN KEY(org_id,target_id) REFERENCES os_records(org_id,id)
);
CREATE TABLE IF NOT EXISTS os_participations (
  org_id text NOT NULL REFERENCES os_orgs(id), id text NOT NULL, target_id text NOT NULL,
  module_id text NOT NULL CHECK(module_id IN ('events','volunteers')),
  booking_record_id text NOT NULL, contact_id text NOT NULL, intake_id text,
  state text NOT NULL DEFAULT 'requested' CHECK(state IN ('requested','waitlisted','confirmed','cancelled')),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  source text NOT NULL CHECK(source IN ('staff','intake','legacy','recovered')),
  consent jsonb, frozen jsonb, waitlist_sequence bigint,
  confirmed_at timestamptz, cancelled_at timestamptz,
  created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  recovered boolean NOT NULL DEFAULT false, recovered_state text, last_command jsonb,
  PRIMARY KEY(org_id,id), UNIQUE(org_id,booking_record_id),
  FOREIGN KEY(org_id,target_id) REFERENCES os_participation_targets(org_id,target_id),
  FOREIGN KEY(org_id,booking_record_id) REFERENCES os_records(org_id,id),
  FOREIGN KEY(org_id,contact_id) REFERENCES os_records(org_id,id),
  FOREIGN KEY(org_id,intake_id) REFERENCES os_intake(org_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS os_participation_active_contact ON os_participations(org_id,target_id,contact_id) WHERE state<>'cancelled';
CREATE UNIQUE INDEX IF NOT EXISTS os_participation_intake ON os_participations(org_id,target_id,intake_id) WHERE intake_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS os_participation_target_state ON os_participations(org_id,target_id,state,waitlist_sequence,id);
CREATE TABLE IF NOT EXISTS os_participation_outbox (
  org_id text NOT NULL REFERENCES os_orgs(id), id text NOT NULL, participation_id text NOT NULL,
  event_revision integer NOT NULL CHECK(event_revision>0), purpose text NOT NULL DEFAULT 'participation',
  channel text NOT NULL DEFAULT 'email', state text NOT NULL DEFAULT 'paused' CHECK(state IN ('paused','cancelled')),
  payload jsonb NOT NULL CHECK(octet_length(payload::text)<=2048), created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,id), FOREIGN KEY(org_id,participation_id) REFERENCES os_participations(org_id,id),
  UNIQUE(org_id,participation_id,event_revision,purpose,channel)
);
ALTER TABLE os_participation_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participation_targets FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participation_targets;
CREATE POLICY tenant ON os_participation_targets USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participations;
CREATE POLICY tenant ON os_participations USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_participation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participation_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participation_outbox;
CREATE POLICY tenant ON os_participation_outbox USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));

-- Delivery consent is a new authority; historical preference-only consent is not migrated.
ALTER TABLE os_participations ADD COLUMN IF NOT EXISTS delivery_consent jsonb;
ALTER TABLE os_participations DROP CONSTRAINT IF EXISTS os_participations_delivery_consent_size;
ALTER TABLE os_participations ADD CONSTRAINT os_participations_delivery_consent_size CHECK(delivery_consent IS NULL OR (jsonb_typeof(delivery_consent)='object' AND octet_length(delivery_consent::text)<=4096));
CREATE TABLE IF NOT EXISTS os_participation_delivery_policies (
 org_id text PRIMARY KEY REFERENCES os_orgs(id), revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 enabled boolean NOT NULL DEFAULT false, epoch text NOT NULL, activated_at timestamptz,
 template_version text NOT NULL, last_command jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS os_participation_delivery_previews (
 org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL,actor_id text NOT NULL,
 policy_revision integer NOT NULL CHECK(policy_revision>0),review_hash text NOT NULL,
 bindings jsonb NOT NULL CHECK(octet_length(bindings::text)<=65536),
 expires_at timestamptz NOT NULL,committed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id)
);
ALTER TABLE os_participation_delivery_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participation_delivery_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participation_delivery_policies;
CREATE POLICY tenant ON os_participation_delivery_policies USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_participation_delivery_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participation_delivery_previews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participation_delivery_previews;
CREATE POLICY tenant ON os_participation_delivery_previews USING (org_id=current_setting('app.org_id',true)) WITH CHECK (org_id=current_setting('app.org_id',true));
ALTER TABLE os_job_tenants ADD COLUMN IF NOT EXISTS participation_last_run_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z';
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS participation_revision integer;
UPDATE os_participation_outbox SET participation_revision=event_revision WHERE participation_revision IS NULL;
ALTER TABLE os_participation_outbox ALTER COLUMN participation_revision SET NOT NULL;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS intent_kind text NOT NULL DEFAULT 'legacy';
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS consent_revision integer NOT NULL DEFAULT 0;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS consent_copy text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS user_id text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS link_id text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS link_revision integer;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS recipient_hash text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS policy_epoch text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS template_version text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS relay_key text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS payload_hash text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS first_attempt_at timestamptz;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS lease_owner text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS lease_until timestamptz;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS next_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS safe_code text;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS provider_event_at timestamptz;
ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS budget_bytes integer NOT NULL DEFAULT 0;
ALTER TABLE os_participation_outbox DROP CONSTRAINT IF EXISTS os_participation_outbox_state_check;
ALTER TABLE os_participation_outbox ADD CONSTRAINT os_participation_outbox_state_check CHECK(state IN ('paused','pending','leased','accepted','delivered','suppressed','failed','unknown','cancelled'));
ALTER TABLE os_participation_outbox DROP CONSTRAINT IF EXISTS os_participation_outbox_delivery_bounds;
ALTER TABLE os_participation_outbox ADD CONSTRAINT os_participation_outbox_delivery_bounds CHECK(
 participation_revision>0 AND intent_kind IN ('legacy','snapshot','transition') AND consent_revision>=0
 AND attempts>=0 AND budget_bytes BETWEEN 0 AND 16384
 AND (safe_code IS NULL OR length(safe_code)<=100)
 AND (relay_key IS NULL OR length(relay_key)<=128)
 AND (template_version IS NULL OR length(template_version)<=100)
 AND (consent_copy IS NULL OR length(consent_copy)<=100)
);
CREATE UNIQUE INDEX IF NOT EXISTS os_participation_delivery_causal ON os_participation_outbox(org_id,participation_id,participation_revision,consent_revision,template_version,intent_kind) WHERE intent_kind<>'legacy' AND relay_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS os_participation_delivery_due ON os_participation_outbox(org_id,state,next_at) WHERE intent_kind<>'legacy';
-- Preserve legacy paused-journal writes while keeping a non-null causal revision.
CREATE OR REPLACE FUNCTION os_participation_legacy_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.participation_revision IS NULL THEN NEW.participation_revision=NEW.event_revision; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS os_participation_legacy_revision ON os_participation_outbox;
CREATE TRIGGER os_participation_legacy_revision BEFORE INSERT OR UPDATE ON os_participation_outbox FOR EACH ROW EXECUTE FUNCTION os_participation_legacy_revision();

ALTER TABLE os_participation_outbox ADD COLUMN IF NOT EXISTS recovered_state text CHECK(recovered_state IS NULL OR recovered_state IN ('paused','pending','leased','accepted','delivered','suppressed','failed','unknown','cancelled'));

-- Short-lived grant-report review proofs are private and carry no approval authority after restore.
CREATE TABLE IF NOT EXISTS os_grant_report_previews (
 org_id text NOT NULL REFERENCES os_orgs(id),
 id text NOT NULL,
 actor_id text NOT NULL,
 manifest_id text NOT NULL,
 manifest_revision integer NOT NULL CHECK(manifest_revision>0),
 review_hash text NOT NULL CHECK(review_hash ~ '^[a-f0-9]{64}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=2105344),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id)
);
ALTER TABLE os_grant_report_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_grant_report_previews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_grant_report_previews;
CREATE POLICY tenant ON os_grant_report_previews USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
CREATE UNIQUE INDEX IF NOT EXISTS os_grant_report_command ON os_reports(org_id,(payload#>>'{command,actorId}'),(payload#>>'{command,keyHash}')) WHERE payload->>'kind'='grant-period' AND payload->>'methodVersion'='grant-report-v1';
CREATE UNIQUE INDEX IF NOT EXISTS os_grant_report_edition ON os_reports(org_id,(payload#>>'{manifest,id}'),(payload#>>'{manifest,revision}'),(payload#>>'{manifest,sourceDigest}')) WHERE payload->>'kind'='grant-period' AND payload->>'methodVersion'='grant-report-v1';

-- Explicit, manual task drafting. Historical identities may outlive source trash.
CREATE TABLE IF NOT EXISTS os_task_recurrence_series (
 org_id text NOT NULL REFERENCES os_orgs(id), id text NOT NULL,
 root_record_id text NOT NULL, method text NOT NULL CHECK(method='task-recurrence-v1'),
 anchor jsonb NOT NULL CHECK(jsonb_typeof(anchor)='object' AND octet_length(anchor::text)<=8192),
 state text NOT NULL CHECK(state IN ('active','ended','recovered')),
 revision integer NOT NULL CHECK(revision>0),tip_record_id text NOT NULL,
 tip_sequence integer NOT NULL CHECK(tip_sequence BETWEEN 0 AND 2000),
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),ended_at timestamptz,
 end_code text CHECK(end_code IN ('explicit','record-cancelled','record-deleted','backup-recovery')),
 recovered_state text CHECK(recovered_state IN ('active','ended','recovered')),
 budget_bytes integer NOT NULL CHECK(budget_bytes>0),
 last_end_command jsonb CHECK(last_end_command IS NULL OR (jsonb_typeof(last_end_command)='object' AND octet_length(last_end_command::text)<=512)),
 PRIMARY KEY(org_id,id),UNIQUE(org_id,root_record_id)
);
CREATE TABLE IF NOT EXISTS os_task_recurrence_occurrences (
 org_id text NOT NULL REFERENCES os_orgs(id),series_id text NOT NULL,
 sequence integer NOT NULL CHECK(sequence BETWEEN 1 AND 2000),source_record_id text NOT NULL,
 generated_record_id text NOT NULL,accepted_command_hash text NOT NULL CHECK(accepted_command_hash ~ '^[a-f0-9]{64}$'),
 packet jsonb NOT NULL CHECK(jsonb_typeof(packet)='object' AND octet_length(packet::text)<=8192),
 PRIMARY KEY(org_id,series_id,sequence),UNIQUE(org_id,source_record_id),UNIQUE(org_id,generated_record_id),
 UNIQUE(org_id,accepted_command_hash),FOREIGN KEY(org_id,series_id) REFERENCES os_task_recurrence_series(org_id,id)
);
ALTER TABLE os_task_recurrence_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_task_recurrence_series FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_task_recurrence_series;
CREATE POLICY tenant ON os_task_recurrence_series USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
ALTER TABLE os_task_recurrence_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_task_recurrence_occurrences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_task_recurrence_occurrences;
CREATE POLICY tenant ON os_task_recurrence_occurrences USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
DROP TRIGGER IF EXISTS immutable_task_recurrence_occurrences ON os_task_recurrence_occurrences;
CREATE TRIGGER immutable_task_recurrence_occurrences BEFORE UPDATE OR DELETE ON os_task_recurrence_occurrences FOR EACH ROW EXECUTE FUNCTION os_immutable();

-- Explicit directory copies and dated reviews; recovered evidence grants no authority.
CREATE TABLE IF NOT EXISTS os_resource_directory_history (
 org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL CHECK(id ~ '^[a-f0-9]{64}$'),
 row_kind text NOT NULL CHECK(row_kind IN ('capture','event')),capture_id text NOT NULL CHECK(capture_id ~ '^[a-f0-9]{64}$'),
 binding_id text,sequence integer,resource_id text,catalog_kind text,listing_id text,
 origin_mode text NOT NULL CHECK(origin_mode IN ('live','recovered')),
 command_hash text,request_hash text,actor_binding_hash text,
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=32768),
 budget_bytes integer NOT NULL CHECK(budget_bytes=octet_length(payload::text)+4096),
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(org_id,id),
 CHECK((row_kind='capture' AND binding_id IS NULL AND sequence IS NULL AND resource_id IS NULL AND catalog_kind IS NULL AND listing_id IS NULL AND command_hash IS NULL AND request_hash IS NULL AND actor_binding_hash IS NULL)
 OR(row_kind='event' AND binding_id IS NOT NULL AND sequence IS NOT NULL AND resource_id IS NOT NULL AND catalog_kind IS NOT NULL AND listing_id IS NOT NULL AND binding_id ~ '^[A-Za-z0-9_-]{1,100}$' AND sequence BETWEEN 1 AND 32 AND resource_id ~ '^[A-Za-z0-9_-]{1,100}$' AND catalog_kind IN ('tools','benefits') AND listing_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'
 AND((origin_mode='live' AND command_hash IS NOT NULL AND request_hash IS NOT NULL AND actor_binding_hash IS NOT NULL AND command_hash ~ '^[a-f0-9]{64}$' AND request_hash ~ '^[a-f0-9]{64}$' AND actor_binding_hash ~ '^[a-f0-9]{64}$') OR(origin_mode='recovered' AND command_hash IS NULL AND request_hash IS NULL AND actor_binding_hash IS NULL))))
);
CREATE UNIQUE INDEX IF NOT EXISTS os_resource_directory_capture ON os_resource_directory_history(org_id,capture_id) WHERE row_kind='capture';
CREATE UNIQUE INDEX IF NOT EXISTS os_resource_directory_sequence ON os_resource_directory_history(org_id,binding_id,sequence) WHERE row_kind='event';
CREATE UNIQUE INDEX IF NOT EXISTS os_resource_directory_root ON os_resource_directory_history(org_id,catalog_kind,listing_id) WHERE row_kind='event' AND sequence=1;
CREATE UNIQUE INDEX IF NOT EXISTS os_resource_directory_command ON os_resource_directory_history(org_id,command_hash) WHERE command_hash IS NOT NULL;
ALTER TABLE os_resource_directory_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_resource_directory_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_resource_directory_history;
CREATE POLICY tenant ON os_resource_directory_history USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
DROP TRIGGER IF EXISTS immutable_resource_directory_history ON os_resource_directory_history;
CREATE TRIGGER immutable_resource_directory_history BEFORE UPDATE OR DELETE ON os_resource_directory_history FOR EACH ROW EXECUTE FUNCTION os_immutable();

-- Private learning provenance. Restored histories never restore command authority.
CREATE TABLE IF NOT EXISTS os_learning_history (
 org_id text NOT NULL REFERENCES os_orgs(id),
 id text NOT NULL CHECK(id ~ '^[a-f0-9]{64}$'),
 row_kind text NOT NULL CHECK(row_kind IN ('source','evidence','event','recovered-report')),
 origin_mode text NOT NULL CHECK(origin_mode IN ('live','recovered')),
 origin_org_id text NOT NULL CHECK(origin_org_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 binding_id text CHECK(binding_id IS NULL OR binding_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 sequence integer, source_version integer,
 program_id text CHECK(program_id IS NULL OR program_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4194304),
 receipt jsonb CHECK(receipt IS NULL OR (jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=8192)),
 budget_bytes integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id),
 CHECK(budget_bytes=octet_length(payload::text)+COALESCE(octet_length(receipt::text),0)+4096),
 CHECK((row_kind='source' AND binding_id IS NOT NULL AND source_version BETWEEN 1 AND 8
        AND sequence IS NULL AND program_id IS NULL
        AND payload->>'format'='charitology-learning-source' AND payload->>'version'='1'
        AND payload->>'sha256'=id AND payload->>'originOrgId'=origin_org_id
        AND payload->>'bindingId'=binding_id AND (payload->>'sourceVersion')::integer=source_version)
    OR (row_kind='evidence' AND binding_id IS NULL AND source_version IS NULL
        AND sequence IS NULL AND program_id IS NULL AND octet_length(payload::text)<=262144
        AND payload->>'format'='charitology-learning-approved-evidence' AND payload->>'version'='1'
        AND payload->>'sha256'=id AND payload#>>'{pin,originOrgId}'=origin_org_id)
    OR (row_kind='event' AND binding_id IS NOT NULL AND source_version IS NULL
        AND sequence BETWEEN 1 AND 1000 AND program_id IS NOT NULL AND octet_length(payload::text)<=131072
        AND payload->>'format'='charitology-learning-event' AND payload->>'version'='1'
        AND payload->>'sha256'=id AND payload->>'originOrgId'=origin_org_id
        AND payload->>'bindingId'=binding_id AND payload->>'programId'=program_id
        AND (payload->>'sequence')::integer=sequence)
    OR (row_kind='recovered-report' AND origin_mode='recovered' AND binding_id IS NULL
        AND source_version IS NULL AND sequence IS NULL AND program_id IS NOT NULL
        AND payload->>'format'='charitology-os-report' AND payload->>'kind'='learning-review'
        AND payload->>'version'='1' AND payload->>'methodVersion'='learning-review-v1'
        AND payload->>'checksum'=id AND payload->>'orgId'=origin_org_id
        AND payload#>>'{selection,selection,program,recordId}'=program_id)),
 CHECK((row_kind='event' AND origin_mode='live' AND receipt IS NOT NULL
        AND receipt->>'version'='1' AND receipt->>'commandHash' ~ '^[a-f0-9]{64}$'
        AND receipt->>'requestHash' ~ '^[a-f0-9]{64}$'
        AND receipt->>'actorBindingHash' ~ '^[a-f0-9]{64}$')
       OR ((row_kind<>'event' OR origin_mode='recovered') AND receipt IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS os_learning_event_sequence ON os_learning_history(org_id,origin_org_id,binding_id,sequence) WHERE row_kind='event';
CREATE UNIQUE INDEX IF NOT EXISTS os_learning_source_version ON os_learning_history(org_id,origin_org_id,binding_id,source_version) WHERE row_kind='source';
CREATE UNIQUE INDEX IF NOT EXISTS os_learning_command ON os_learning_history(org_id,(receipt->>'commandHash')) WHERE receipt IS NOT NULL;
CREATE INDEX IF NOT EXISTS os_learning_program_history ON os_learning_history(org_id,program_id,binding_id,sequence);
CREATE UNIQUE INDEX IF NOT EXISTS os_learning_correction_terminal ON os_learning_history(org_id,origin_org_id,binding_id,(payload#>>'{payload,correctionEventSha256}')) WHERE row_kind='event' AND payload#>>'{payload,kind}' IN ('correction-applied','correction-abandoned');
CREATE UNIQUE INDEX IF NOT EXISTS os_learning_correction_edge ON os_learning_history(org_id,origin_org_id,binding_id,(payload#>>'{payload,replaces,recordId}')) WHERE row_kind='event' AND payload#>>'{payload,kind}'='correction-applied';
ALTER TABLE os_learning_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_learning_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_learning_history;
CREATE POLICY tenant ON os_learning_history USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
DROP TRIGGER IF EXISTS immutable_learning_history ON os_learning_history;
CREATE TRIGGER immutable_learning_history BEFORE UPDATE OR DELETE ON os_learning_history FOR EACH ROW EXECUTE FUNCTION os_immutable();

CREATE TABLE IF NOT EXISTS os_learning_previews (
 org_id text NOT NULL REFERENCES os_orgs(id),id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 actor_id text NOT NULL CHECK(actor_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 session_sha256 text NOT NULL CHECK(session_sha256 ~ '^[a-f0-9]{64}$'),
 membership_sha256 text NOT NULL CHECK(membership_sha256 ~ '^[a-f0-9]{64}$'),
 restore_epoch_sha256 text NOT NULL CHECK(restore_epoch_sha256 ~ '^[a-f0-9]{64}$'),
 kind text NOT NULL CHECK(kind IN ('inspection','map','measure','correct','apply-correction','abandon-correction','decide','adopt','freeze')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=4194304),
 review_sha256 text NOT NULL CHECK(review_sha256 ~ '^[a-f0-9]{64}$'),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id)
);
CREATE INDEX IF NOT EXISTS os_learning_preview_expiry ON os_learning_previews(expires_at);
CREATE INDEX IF NOT EXISTS os_learning_preview_actor ON os_learning_previews(org_id,actor_id,created_at);
ALTER TABLE os_learning_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_learning_previews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_learning_previews;
CREATE POLICY tenant ON os_learning_previews USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
CREATE UNIQUE INDEX IF NOT EXISTS os_learning_report_edition ON os_reports(org_id,(payload#>>'{selection,selection,manifestRecordId}'),(payload#>>'{selection,manifest,revision}'),(payload#>>'{selection,sourceDigest}')) WHERE payload->>'kind'='learning-review' AND payload->>'methodVersion'='learning-review-v1';
