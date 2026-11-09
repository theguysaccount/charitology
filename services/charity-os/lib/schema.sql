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
-- Feedback adds one closed kind to the existing anonymous intake queue.
ALTER TABLE os_publications DROP CONSTRAINT IF EXISTS os_publications_kind_check;
ALTER TABLE os_publications ADD CONSTRAINT os_publications_kind_check
 CHECK(kind IN ('contact','event-interest','volunteer-interest','feedback'));
ALTER TABLE os_publications DROP CONSTRAINT IF EXISTS os_publications_feedback_no_target;
ALTER TABLE os_publications ADD CONSTRAINT os_publications_feedback_no_target
 CHECK(kind<>'feedback' OR (target_id IS NULL AND target_module IS NULL AND target_revision IS NULL));
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
CREATE UNIQUE INDEX IF NOT EXISTS os_feedback_intake_conversion
 ON os_events(org_id,(detail->>'intakeId')) WHERE action='intake.feedback-converted';
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
-- NULL retains the original full-occurrence contract; no historical JSON is rewritten.
ALTER TABLE os_participations ADD COLUMN IF NOT EXISTS requested_interval jsonb
  CHECK (requested_interval IS NULL OR (jsonb_typeof(requested_interval)='object' AND octet_length(requested_interval::text)<=1024));
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
 participation_revision>0 AND intent_kind IN ('legacy','snapshot','transition','reminder') AND consent_revision>=0
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

-- Incubator is a separate interpretation namespace. Restored receipts are
-- historical evidence only; only a live event can reserve a command key.
CREATE TABLE IF NOT EXISTS os_incubator_history (
 org_id text NOT NULL REFERENCES os_orgs(id),
 id text NOT NULL CHECK(id ~ '^[a-f0-9]{64}$'),
 row_kind text NOT NULL CHECK(row_kind IN ('source','event')),
 origin_mode text NOT NULL CHECK(origin_mode IN ('live','recovered')),
 origin_org_id text NOT NULL CHECK(origin_org_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 binding_id text NOT NULL CHECK(binding_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 sequence integer,source_version integer,
 program_id text CHECK(program_id IS NULL OR program_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=1056768),
 receipt jsonb CHECK(receipt IS NULL OR (jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=8192)),
 budget_bytes integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,id),
 CHECK(budget_bytes=octet_length(payload::text)+COALESCE(octet_length(receipt::text),0)+4096),
 CHECK(((row_kind='source' AND source_version BETWEEN 1 AND 8 AND sequence IS NULL AND program_id IS NULL AND receipt IS NULL
   AND payload->>'format'='charitology-incubator-source' AND payload->'version'='1'::jsonb
   AND payload->>'sha256'=id AND payload->>'originOrgId'=origin_org_id
   AND payload->>'bindingId'=binding_id AND (payload->>'sourceVersion')::integer=source_version)
 OR (row_kind='event' AND source_version IS NULL AND sequence BETWEEN 1 AND 8 AND program_id IS NOT NULL
   AND octet_length(payload::text)<=131072
   AND payload->>'format'='charitology-incubator-event' AND payload->'version'='1'::jsonb
   AND payload->>'sha256'=id AND payload->>'originOrgId'=origin_org_id
   AND payload->>'bindingId'=binding_id AND payload#>>'{program,recordId}'=program_id
   AND (payload->>'sequence')::integer=sequence)) IS TRUE),
 CHECK((row_kind<>'event' OR origin_mode='recovered' OR (receipt IS NOT NULL
   AND receipt->>'format'='charitology-incubator-receipt' AND receipt->>'version'='1'
   AND receipt->>'commandHash' ~ '^[a-f0-9]{64}$' AND receipt->>'requestHash' ~ '^[a-f0-9]{64}$'
   AND receipt->>'actorBindingHash' ~ '^[a-f0-9]{64}$'
   AND receipt#>>'{result,head,sha256}'=id)) IS TRUE)
);
CREATE UNIQUE INDEX IF NOT EXISTS os_incubator_source_version ON os_incubator_history(org_id,origin_org_id,binding_id,source_version) WHERE row_kind='source';
CREATE UNIQUE INDEX IF NOT EXISTS os_incubator_event_sequence ON os_incubator_history(org_id,origin_org_id,binding_id,sequence) WHERE row_kind='event';
CREATE UNIQUE INDEX IF NOT EXISTS os_incubator_command ON os_incubator_history(org_id,(receipt->>'commandHash')) WHERE row_kind='event' AND origin_mode='live';
CREATE INDEX IF NOT EXISTS os_incubator_program_history ON os_incubator_history(org_id,program_id,binding_id,sequence);
ALTER TABLE os_incubator_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_incubator_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_incubator_history;
CREATE POLICY tenant ON os_incubator_history USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
DROP TRIGGER IF EXISTS immutable_incubator_history ON os_incubator_history;
CREATE TRIGGER immutable_incubator_history BEFORE UPDATE OR DELETE ON os_incubator_history FOR EACH ROW EXECUTE FUNCTION os_immutable();

-- Own arrival assertions are unverified history, separate from attendance.
CREATE TABLE IF NOT EXISTS os_participation_checkins (
 org_id text NOT NULL REFERENCES os_orgs(id), id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 origin_mode text NOT NULL CHECK(origin_mode IN ('live','recovered')), revision integer NOT NULL CHECK(revision IN (1,2)),
 live_participation_id text, history jsonb NOT NULL CHECK(jsonb_typeof(history)='object' AND octet_length(history::text)<=2048),
 report_receipt jsonb CHECK(report_receipt IS NULL OR (jsonb_typeof(report_receipt)='object' AND octet_length(report_receipt::text)<=1024)),
 withdrawn_at timestamptz,
 withdrawal_receipt jsonb CHECK(withdrawal_receipt IS NULL OR (jsonb_typeof(withdrawal_receipt)='object' AND octet_length(withdrawal_receipt::text)<=1024)),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 PRIMARY KEY(org_id,id), UNIQUE(org_id,live_participation_id),
 FOREIGN KEY(org_id,live_participation_id) REFERENCES os_participations(org_id,id),
 CHECK((history->>'id'=id AND history->>'participationId' ~ '^[A-Za-z0-9_-]{1,100}$' AND history->>'originOrgId' ~ '^[A-Za-z0-9_-]{1,100}$') IS TRUE),
 CHECK(((origin_mode='recovered' AND revision=1 AND live_participation_id IS NULL AND report_receipt IS NULL AND withdrawn_at IS NULL AND withdrawal_receipt IS NULL)
 OR (origin_mode='live' AND live_participation_id=history->>'participationId' AND history->>'originOrgId'=org_id AND history->'withdrawnAt'='null'::jsonb AND report_receipt IS NOT NULL
 AND ((revision=1 AND withdrawn_at IS NULL AND withdrawal_receipt IS NULL) OR (revision=2 AND withdrawn_at IS NOT NULL AND withdrawal_receipt IS NOT NULL)))) IS TRUE)
);
CREATE UNIQUE INDEX IF NOT EXISTS os_checkin_original_parent ON os_participation_checkins(org_id,(history->>'originOrgId'),(history->>'participationId'));
CREATE INDEX IF NOT EXISTS os_checkin_historical_parent ON os_participation_checkins(org_id,(history->>'participationId'));
ALTER TABLE os_participation_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participation_checkins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participation_checkins;
CREATE POLICY tenant ON os_participation_checkins USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
CREATE OR REPLACE FUNCTION os_checkin_terminal_withdrawal() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retained self-report history'; END IF;
 IF OLD.origin_mode<>'live' OR OLD.revision<>1 OR OLD.withdrawn_at IS NOT NULL
 OR NEW.revision<>2 OR NEW.withdrawn_at IS NULL OR NEW.withdrawal_receipt IS NULL
 OR (to_jsonb(NEW)-ARRAY['revision','withdrawn_at','withdrawal_receipt','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revision','withdrawn_at','withdrawal_receipt','updated_at'])
 OR NEW.updated_at IS DISTINCT FROM NEW.withdrawn_at OR NEW.withdrawn_at<OLD.created_at
 OR NOT ((NEW.withdrawal_receipt-ARRAY['intentHash','payloadHash','actorHash','action','result']='{}'::jsonb
 AND NEW.withdrawal_receipt->>'intentHash' ~ '^[a-f0-9]{64}$'
 AND NEW.withdrawal_receipt->>'payloadHash' ~ '^[a-f0-9]{64}$'
 AND NEW.withdrawal_receipt->>'action'='withdraw'
 AND NEW.withdrawal_receipt->>'actorHash'=OLD.history#>>'{affirmation,actorHash}'
 AND jsonb_typeof(NEW.withdrawal_receipt->'result')='object'
 AND (NEW.withdrawal_receipt->'result')-ARRAY['action','id','revision','claimSha256','at','auditRetained']='{}'::jsonb
 AND NEW.withdrawal_receipt#>>'{result,action}'='withdrawn'
 AND NEW.withdrawal_receipt#>>'{result,id}'=OLD.id
 AND NEW.withdrawal_receipt#>>'{result,revision}'='2'
 AND NEW.withdrawal_receipt#>'{result,revision}'='2'::jsonb
 AND jsonb_typeof(NEW.withdrawal_receipt#>'{result,auditRetained}')='boolean'
 AND NEW.withdrawal_receipt#>>'{result,at}'=to_char(NEW.withdrawn_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
 AND NEW.withdrawal_receipt#>>'{result,claimSha256}'=OLD.history->>'claimSha256') IS TRUE)
 THEN RAISE EXCEPTION 'Only one terminal self-report withdrawal is allowed'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS terminal_checkin ON os_participation_checkins;
CREATE TRIGGER terminal_checkin BEFORE UPDATE OR DELETE ON os_participation_checkins FOR EACH ROW EXECUTE FUNCTION os_checkin_terminal_withdrawal();

-- Staff group containers retain immutable decision receipts. Inactive recovery
-- clears live links; the application separately admits complete safe-exit budgets.
CREATE TABLE IF NOT EXISTS os_participation_groups (
 org_id text NOT NULL REFERENCES os_orgs(id), id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 origin_mode text NOT NULL CHECK(origin_mode IN ('live','recovered')),
 module_id text NOT NULL CHECK(module_id IN ('events','volunteers')),
 live_target_id text, roster_ids jsonb NOT NULL, coordinator_intake_id text,
 state text NOT NULL, revision integer NOT NULL CHECK(revision BETWEEN 1 AND 12),
 last_command_hash text, history jsonb,
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
 PRIMARY KEY(org_id,id), FOREIGN KEY(org_id,live_target_id) REFERENCES os_participation_targets(org_id,target_id),
 CHECK(updated_at>=created_at),
 CHECK(coordinator_intake_id IS NULL OR coordinator_intake_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 CHECK(((origin_mode='live' AND state IN ('draft','admitted','closed') AND live_target_id IS NOT NULL
  AND live_target_id ~ '^[A-Za-z0-9_-]{1,100}$' AND jsonb_typeof(roster_ids)='array'
  AND jsonb_array_length(roster_ids) BETWEEN 2 AND 10 AND history IS NULL
  AND last_command_hash ~ '^[a-f0-9]{64}$') OR
 (origin_mode='recovered' AND state='archived' AND revision=1 AND live_target_id IS NULL
  AND roster_ids='[]'::jsonb AND coordinator_intake_id IS NULL AND last_command_hash IS NULL
  AND jsonb_typeof(history)='object' AND history->'version'='1'::jsonb
  AND history->>'id'=id AND history->>'moduleId'=module_id AND octet_length(history::text)<=65536)) IS TRUE)
);
CREATE TABLE IF NOT EXISTS os_participation_group_receipts (
 org_id text NOT NULL, command_hash text NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 group_id text NOT NULL, receipt jsonb NOT NULL,
 PRIMARY KEY(org_id,command_hash), UNIQUE(org_id,group_id,command_hash),
 FOREIGN KEY(org_id,group_id) REFERENCES os_participation_groups(org_id,id),
 CHECK((jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=16384
  AND receipt ?& ARRAY['version','groupId','operation','commandHash','requestHash','authority','reviewSha256','acceptedAtExact','result']
  AND receipt-ARRAY['version','groupId','operation','commandHash','requestHash','authority','reviewSha256','acceptedAtExact','result']='{}'::jsonb
  AND receipt->'version'='1'::jsonb AND receipt->>'groupId'=group_id AND receipt->>'commandHash'=command_hash
  AND receipt->>'requestHash' ~ '^[a-f0-9]{64}$' AND receipt->>'operation' IN ('create','admit','cancel','close')
  AND jsonb_typeof(receipt->'authority')='object'
  AND receipt->'authority' ?& ARRAY['actorSha256','sessionSha256','membershipSha256','memberCreatedAtExact','restoreEpochSha256']
  AND (receipt->'authority')-ARRAY['actorSha256','sessionSha256','membershipSha256','memberCreatedAtExact','restoreEpochSha256']='{}'::jsonb
  AND receipt#>>'{authority,actorSha256}' ~ '^[a-f0-9]{64}$'
  AND receipt#>>'{authority,sessionSha256}' ~ '^[a-f0-9]{64}$'
  AND receipt#>>'{authority,membershipSha256}' ~ '^[a-f0-9]{64}$'
  AND receipt#>>'{authority,restoreEpochSha256}' ~ '^[a-f0-9]{64}$'
  AND receipt#>>'{authority,memberCreatedAtExact}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
  AND receipt->>'acceptedAtExact' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
  AND jsonb_typeof(receipt->'result')='object' AND receipt#>>'{result,groupId}'=group_id
  AND jsonb_typeof(receipt#>'{result,groupRevision}')='number'
  AND receipt#>>'{result,groupRevision}' ~ '^(?:[1-9]|1[0-2])$'
  AND ((receipt->>'operation' IN ('create','close') AND receipt->'reviewSha256'='null'::jsonb)
   OR (receipt->>'operation' IN ('admit','cancel') AND receipt->>'reviewSha256' ~ '^[a-f0-9]{64}$'))) IS TRUE)
);
DO $group_last_receipt$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='os_participation_groups'::regclass AND conname='os_group_last_receipt') THEN
 ALTER TABLE os_participation_groups ADD CONSTRAINT os_group_last_receipt
 FOREIGN KEY(org_id,id,last_command_hash) REFERENCES os_participation_group_receipts(org_id,group_id,command_hash)
 DEFERRABLE INITIALLY DEFERRED;
 END IF;
END $group_last_receipt$;
ALTER TABLE os_participation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participation_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participation_groups;
CREATE POLICY tenant ON os_participation_groups
 USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
ALTER TABLE os_participation_group_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participation_group_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_participation_group_receipts;
CREATE POLICY tenant ON os_participation_group_receipts
 USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));

CREATE OR REPLACE FUNCTION os_participation_group_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sorted_roster jsonb; distinct_roster integer;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'group history is retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' AND NEW.origin_mode='live' THEN
  IF NEW.state<>'draft' OR NEW.revision<>1 OR NEW.created_at<>NEW.updated_at
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.roster_ids) AS item(value) WHERE (jsonb_typeof(item.value)='string' AND item.value#>>'{}' ~ '^[A-Za-z0-9_-]{1,100}$') IS NOT TRUE)
  THEN RAISE EXCEPTION 'invalid initial group' USING ERRCODE='23514'; END IF;
  SELECT jsonb_agg(member.value ORDER BY member.value COLLATE "C"),count(DISTINCT member.value)::int INTO sorted_roster,distinct_roster
   FROM jsonb_array_elements_text(NEW.roster_ids) AS member(value);
  IF sorted_roster IS DISTINCT FROM NEW.roster_ids OR distinct_roster<>jsonb_array_length(NEW.roster_ids)
  THEN RAISE EXCEPTION 'invalid group roster' USING ERRCODE='23514'; END IF;
 ELSIF TG_OP='UPDATE' THEN
  IF OLD.origin_mode<>'live' OR OLD.state='closed' OR NEW.revision<>OLD.revision+1 OR NEW.revision>12
   OR NEW.last_command_hash IS NOT DISTINCT FROM OLD.last_command_hash OR NEW.updated_at<OLD.updated_at
   OR (to_jsonb(NEW)-ARRAY['state','revision','last_command_hash','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','revision','last_command_hash','updated_at'])
   OR NOT ((OLD.state='draft' AND NEW.state IN ('admitted','closed')) OR (OLD.state='admitted' AND NEW.state='admitted'))
  THEN RAISE EXCEPTION 'invalid group transition' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS group_guard ON os_participation_groups;
CREATE TRIGGER group_guard BEFORE INSERT OR UPDATE OR DELETE ON os_participation_groups
 FOR EACH ROW EXECUTE FUNCTION os_participation_group_guard();
DROP TRIGGER IF EXISTS immutable_group_receipt ON os_participation_group_receipts;
CREATE TRIGGER immutable_group_receipt BEFORE UPDATE OR DELETE ON os_participation_group_receipts
 FOR EACH ROW EXECUTE FUNCTION os_immutable();

-- Deferred so create-container then create-receipt is legal inside ONE outer tx.
-- Also catches unused extra receipts: every receipt must belong to the complete
-- monotonic chain represented by the current container revision/head.
CREATE OR REPLACE FUNCTION os_participation_group_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE g os_participation_groups; group_identity text; x record; r jsonb; n integer:=0; previous_at timestamptz;
 admitted text[]:=NULL; cancelled text[]:=ARRAY[]::text[]; chosen text[]; person_id text; last_hash text;
BEGIN
 IF TG_TABLE_NAME='os_participation_groups' THEN group_identity:=NEW.id; ELSE group_identity:=NEW.group_id; END IF;
 SELECT * INTO STRICT g FROM os_participation_groups WHERE org_id=NEW.org_id AND id=group_identity;
 IF g.origin_mode='recovered' THEN
  IF EXISTS(SELECT 1 FROM os_participation_group_receipts WHERE org_id=g.org_id AND group_id=g.id)
  THEN RAISE EXCEPTION 'archive has no receipt capability' USING ERRCODE='23514'; END IF;
  RETURN NULL;
 END IF;
 FOR x IN SELECT command_hash,receipt FROM os_participation_group_receipts WHERE org_id=g.org_id AND group_id=g.id ORDER BY (receipt#>>'{result,groupRevision}')::int LOOP
  n:=n+1; r:=x.receipt; last_hash:=x.command_hash;
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR jsonb_typeof(r->'result') IS DISTINCT FROM 'object'
   OR jsonb_typeof(r#>'{result,state}') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'group chain requires an explicit result and state' USING ERRCODE='23514'; END IF;
  IF n>12 OR (r#>>'{result,groupRevision}')::int<>n OR r#>>'{result,groupId}'<>g.id
   OR to_char((r->>'acceptedAtExact')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') IS DISTINCT FROM r->>'acceptedAtExact'
   OR to_char((r#>>'{authority,memberCreatedAtExact}')::timestamptz AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') IS DISTINCT FROM r#>>'{authority,memberCreatedAtExact}'
   OR (r->>'acceptedAtExact')::timestamptz<(r#>>'{authority,memberCreatedAtExact}')::timestamptz
   OR (previous_at IS NOT NULL AND (r->>'acceptedAtExact')::timestamptz<previous_at)
  THEN RAISE EXCEPTION 'invalid group receipt sequence' USING ERRCODE='23514'; END IF;
  previous_at:=(r->>'acceptedAtExact')::timestamptz;
  IF n=1 THEN
   IF r->>'operation' IS DISTINCT FROM 'create' OR r#>>'{result,state}' IS DISTINCT FROM 'draft'
    OR r#>>'{result,target,targetId}' IS DISTINCT FROM g.live_target_id
    OR r#>>'{result,target,moduleId}' IS DISTINCT FROM g.module_id
    OR r#>'{result,rosterIds}' IS DISTINCT FROM g.roster_ids
    OR r#>'{result,coordinatorIntakeId}' IS DISTINCT FROM COALESCE(to_jsonb(g.coordinator_intake_id),'null'::jsonb)
    OR previous_at<>g.created_at
   THEN RAISE EXCEPTION 'invalid group creation receipt' USING ERRCODE='23514'; END IF;
  ELSIF n=2 THEN
   IF r->>'operation'='close' THEN
    IF r#>>'{result,state}' IS DISTINCT FROM 'closed' OR g.state<>'closed' OR g.revision<>2
    THEN RAISE EXCEPTION 'invalid group closure' USING ERRCODE='23514'; END IF;
   ELSIF r->>'operation'='admit' THEN
    IF jsonb_typeof(r#>'{result,selected}') IS DISTINCT FROM 'array'
     OR jsonb_typeof(r#>'{result,unselectedIds}') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'group admission requires explicit selected and unselected arrays' USING ERRCODE='23514'; END IF;
    IF (r#>>'{result,state}'='admitted' AND jsonb_array_length(r#>'{result,selected}') BETWEEN 1 AND 10
     AND ((r#>>'{result,selectionMode}'='all' AND jsonb_array_length(r#>'{result,unselectedIds}')=0)
      OR (r#>>'{result,selectionMode}'='subset' AND jsonb_array_length(r#>'{result,unselectedIds}') BETWEEN 1 AND 9))) IS NOT TRUE
    THEN RAISE EXCEPTION 'invalid group admission' USING ERRCODE='23514'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(r#>'{result,selected}') AS item(value)
     WHERE (jsonb_typeof(item.value)='object' AND jsonb_typeof(item.value->'participationId')='string'
      AND item.value->>'participationId' ~ '^[A-Za-z0-9_-]{1,100}$' AND item.value->>'state'='confirmed') IS NOT TRUE)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(r#>'{result,unselectedIds}') AS item(value)
      WHERE (jsonb_typeof(item.value)='string' AND item.value#>>'{}' ~ '^[A-Za-z0-9_-]{1,100}$') IS NOT TRUE)
    THEN RAISE EXCEPTION 'group admission requires typed roster entries' USING ERRCODE='23514'; END IF;
    SELECT array_agg(item.value->>'participationId' ORDER BY (item.value->>'participationId') COLLATE "C") INTO admitted
     FROM jsonb_array_elements(r#>'{result,selected}') AS item(value);
    IF cardinality(admitted)<>(SELECT count(DISTINCT member.participation_id) FROM unnest(admitted) AS member(participation_id))
     OR EXISTS(SELECT 1 FROM unnest(admitted) AS member(participation_id) WHERE member.participation_id IS NULL OR NOT (g.roster_ids ? member.participation_id))
     OR (SELECT jsonb_agg(all_members.participation_id ORDER BY all_members.participation_id COLLATE "C")
      FROM (SELECT unnest(admitted) AS participation_id UNION ALL SELECT jsonb_array_elements_text(r#>'{result,unselectedIds}')) AS all_members) IS DISTINCT FROM g.roster_ids
    THEN RAISE EXCEPTION 'invalid admitted roster' USING ERRCODE='23514'; END IF;
   ELSE RAISE EXCEPTION 'group has only one decision' USING ERRCODE='23514'; END IF;
  ELSE
   IF jsonb_typeof(r#>'{result,selected}') IS DISTINCT FROM 'array'
   THEN RAISE EXCEPTION 'group cancellation requires an explicit selected array' USING ERRCODE='23514'; END IF;
   IF (admitted IS NOT NULL AND r->>'operation'='cancel' AND r#>>'{result,state}'='admitted'
    AND jsonb_array_length(r#>'{result,selected}') BETWEEN 1 AND 10) IS NOT TRUE
   THEN RAISE EXCEPTION 'invalid group cancellation' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(r#>'{result,selected}') AS item(value)
    WHERE (jsonb_typeof(item.value)='object' AND jsonb_typeof(item.value->'participationId')='string'
     AND item.value->>'participationId' ~ '^[A-Za-z0-9_-]{1,100}$' AND item.value->>'state'='cancelled') IS NOT TRUE)
   THEN RAISE EXCEPTION 'group cancellation requires typed roster entries' USING ERRCODE='23514'; END IF;
   chosen:=ARRAY[]::text[];
   FOR person_id IN SELECT item.value->>'participationId' FROM jsonb_array_elements(r#>'{result,selected}') AS item(value) LOOP
    IF person_id IS NULL OR NOT person_id=ANY(admitted) OR person_id=ANY(cancelled) OR person_id=ANY(chosen)
    THEN RAISE EXCEPTION 'group cancellation must change a distinct admitted child' USING ERRCODE='23514'; END IF;
    chosen:=array_append(chosen,person_id);
   END LOOP;
   cancelled:=cancelled||chosen;
  END IF;
 END LOOP;
 IF n<>g.revision OR last_hash IS DISTINCT FROM g.last_command_hash OR previous_at IS DISTINCT FROM g.updated_at
  OR NOT EXISTS(SELECT 1 FROM os_participation_group_receipts WHERE org_id=g.org_id AND command_hash=g.last_command_hash AND receipt#>>'{result,state}'=g.state)
 THEN RAISE EXCEPTION 'dangling group head' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS complete_group_chain ON os_participation_groups;
CREATE CONSTRAINT TRIGGER complete_group_chain AFTER INSERT OR UPDATE ON os_participation_groups
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION os_participation_group_integrity();
DROP TRIGGER IF EXISTS receipt_in_group_chain ON os_participation_group_receipts;
CREATE CONSTRAINT TRIGGER receipt_in_group_chain AFTER INSERT ON os_participation_group_receipts
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION os_participation_group_integrity();

-- Reminder authority is separate, initially absent and never backfilled.
ALTER TABLE os_participations ADD COLUMN IF NOT EXISTS reminder_consent jsonb;
ALTER TABLE os_participations DROP CONSTRAINT IF EXISTS os_participations_reminder_consent_size;
ALTER TABLE os_participations ADD CONSTRAINT os_participations_reminder_consent_size
 CHECK(reminder_consent IS NULL OR (jsonb_typeof(reminder_consent)='object' AND octet_length(reminder_consent::text)<=4096));
ALTER TABLE os_participation_outbox DROP CONSTRAINT IF EXISTS os_participation_reminder_marker;
ALTER TABLE os_participation_outbox ADD CONSTRAINT os_participation_reminder_marker CHECK(
 intent_kind<>'reminder' OR ((jsonb_typeof(payload)='object' AND octet_length(payload::text)<=2048
 AND jsonb_typeof(payload->'reminder')='object'
 AND payload#>>'{reminder,method}'='participation-reminder-v1'
 AND payload#>>'{reminder,version}'='1'
 AND (payload#>>'{reminder,commitmentSha256}')~'^[a-f0-9]{64}$') IS TRUE));
CREATE UNIQUE INDEX IF NOT EXISTS os_participation_reminder_original
 ON os_participation_outbox(org_id,participation_id,((payload->'reminder')->>'commitmentSha256'))
 WHERE intent_kind='reminder';

-- One internal hold for one existing Asset and approved Events session.
CREATE OR REPLACE FUNCTION os_resource_reservation_proof_shape(
 value jsonb, asset text, occurrence text
) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT (
  jsonb_typeof(value)='object' AND octet_length(value::text)<=4096
  AND value ?& ARRAY['version','orgId','asset','session','quantity','interval']
  AND value-ARRAY['version','orgId','asset','session','quantity','interval']='{}'::jsonb
  AND value->'version'='1'::jsonb AND value->'quantity'='1'::jsonb
  AND jsonb_typeof(value->'orgId')='string' AND value->>'orgId' ~ '^[A-Za-z0-9_-]{1,100}$'
  AND asset<>occurrence
  AND NOT EXISTS(
   SELECT 1 FROM (VALUES
    (value->'asset',asset,'assets','asset'),
    (value->'session',occurrence,'events','session')
   ) AS source(pin,id,module_id,kind)
   WHERE (
    jsonb_typeof(pin)='object'
    AND pin ?& ARRAY['id','moduleId','kind','revision','createdAtExact','dataSha256','approvalSha256']
    AND pin-ARRAY['id','moduleId','kind','revision','createdAtExact','dataSha256','approvalSha256']='{}'::jsonb
    AND pin->'id'=to_jsonb(id) AND pin->'moduleId'=to_jsonb(module_id) AND pin->'kind'=to_jsonb(kind)
    AND jsonb_typeof(pin->'revision')='number' AND pin->>'revision' ~ '^[1-9][0-9]{0,9}$'
    AND pin->'revision'<='2147483647'::jsonb
    AND jsonb_typeof(pin->'createdAtExact')='string'
    AND pin->>'createdAtExact' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'
    AND jsonb_typeof(pin->'dataSha256')='string' AND pin->>'dataSha256' ~ '^[a-f0-9]{64}$'
    AND jsonb_typeof(pin->'approvalSha256')='string' AND pin->>'approvalSha256' ~ '^[a-f0-9]{64}$'
   ) IS NOT TRUE
  )
  AND jsonb_typeof(value->'interval')='object'
  AND value->'interval' ?& ARRAY['startAt','endAt','timeZone']
  AND (value->'interval')-ARRAY['startAt','endAt','timeZone']='{}'::jsonb
  AND jsonb_typeof(value#>'{interval,startAt}')='string'
  AND value#>>'{interval,startAt}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  AND jsonb_typeof(value#>'{interval,endAt}')='string'
  AND value#>>'{interval,endAt}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})$'
  AND jsonb_typeof(value#>'{interval,timeZone}')='string'
  AND value#>>'{interval,timeZone}' ~ '^[A-Za-z0-9_./][A-Za-z0-9_+./-]{0,99}$'
 ) IS TRUE
$$;

CREATE OR REPLACE FUNCTION os_resource_reservation_decision_shape(value jsonb)
 RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $$
 SELECT (
  jsonb_typeof(value)='object'
  AND value ?& ARRAY['operation','orgId','actorSha256','acceptedAtExact','previous','next','reason']
  AND value-ARRAY['operation','orgId','actorSha256','acceptedAtExact','previous','next','reason']='{}'::jsonb
  AND value->>'operation' IN ('reserve','release','replace')
  AND jsonb_typeof(value->'orgId')='string' AND value->>'orgId' ~ '^[A-Za-z0-9_-]{1,100}$'
  AND jsonb_typeof(value->'actorSha256')='string' AND value->>'actorSha256' ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(value->'acceptedAtExact')='string'
  AND value->>'acceptedAtExact' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'
  AND ((value->>'operation'='reserve' AND value->'previous'='null'::jsonb AND value->'reason'='null'::jsonb)
   OR (value->>'operation'<>'reserve' AND jsonb_typeof(value->'previous')='object'
    AND jsonb_typeof(value->'reason')='string' AND length(btrim(value->>'reason'))>0
    AND length(value->>'reason')+length(regexp_replace(value->>'reason',U&'[^\+010000-\+10FFFF]','','g'))<=300
    AND value->>'reason' !~ '[[:cntrl:]]'))
  AND ((value->>'operation'='release' AND value->'next'='null'::jsonb)
   OR (value->>'operation'<>'release' AND jsonb_typeof(value->'next')='object'))
  AND (value->>'operation'<>'replace' OR value#>>'{previous,id}'<>value#>>'{next,id}')
  AND NOT EXISTS(
   SELECT 1 FROM (VALUES (value->'previous','released',2),(value->'next','reserved',1)) AS e(effect,state,revision)
   WHERE effect<>'null'::jsonb AND (
    jsonb_typeof(effect)='object' AND effect ?& ARRAY['id','proofSha256','state','revision']
    AND effect-ARRAY['id','proofSha256','state','revision']='{}'::jsonb
    AND jsonb_typeof(effect->'id')='string' AND effect->>'id' ~ '^[A-Za-z0-9_-]{1,100}$'
    AND jsonb_typeof(effect->'proofSha256')='string' AND effect->>'proofSha256' ~ '^[a-f0-9]{64}$'
    AND effect->'state'=to_jsonb(state) AND effect->'revision'=to_jsonb(revision)
   ) IS NOT TRUE
  )
 ) IS TRUE
$$;

CREATE TABLE IF NOT EXISTS os_resource_reservation_commands (
 org_id text NOT NULL REFERENCES os_orgs(id),
 command_hash text NOT NULL CHECK(command_hash ~ '^[a-f0-9]{64}$'),
 receipt jsonb NOT NULL,
 previous_id text GENERATED ALWAYS AS (receipt#>>'{decision,previous,id}') STORED,
 next_id text GENERATED ALWAYS AS (receipt#>>'{decision,next,id}') STORED,
 PRIMARY KEY(org_id,command_hash),
 CHECK((
  jsonb_typeof(receipt)='object' AND octet_length(receipt::text)<=4096
  AND receipt ?& ARRAY['version','decision','commandHash','requestHash','authority','reviewSha256']
  AND receipt-ARRAY['version','decision','commandHash','requestHash','authority','reviewSha256']='{}'::jsonb
  AND receipt->'version'='1'::jsonb AND receipt->'commandHash'=to_jsonb(command_hash)
  AND jsonb_typeof(receipt->'requestHash')='string' AND receipt->>'requestHash' ~ '^[a-f0-9]{64}$'
  AND os_resource_reservation_decision_shape(receipt->'decision')
  AND receipt#>'{decision,orgId}'=to_jsonb(org_id)
  AND jsonb_typeof(receipt->'authority')='object'
  AND receipt->'authority' ?& ARRAY['actorSha256','sessionSha256','membershipSha256','memberCreatedAtExact','restoreEpochSha256']
  AND (receipt->'authority')-ARRAY['actorSha256','sessionSha256','membershipSha256','memberCreatedAtExact','restoreEpochSha256']='{}'::jsonb
  AND receipt#>'{authority,actorSha256}'=receipt#>'{decision,actorSha256}'
  AND jsonb_typeof(receipt#>'{authority,sessionSha256}')='string' AND receipt#>>'{authority,sessionSha256}' ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(receipt#>'{authority,membershipSha256}')='string' AND receipt#>>'{authority,membershipSha256}' ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(receipt#>'{authority,restoreEpochSha256}')='string' AND receipt#>>'{authority,restoreEpochSha256}' ~ '^[a-f0-9]{64}$'
  AND jsonb_typeof(receipt#>'{authority,memberCreatedAtExact}')='string'
  AND receipt#>>'{authority,memberCreatedAtExact}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'
  AND (receipt#>>'{authority,memberCreatedAtExact}')::timestamptz <= (receipt#>>'{decision,acceptedAtExact}')::timestamptz
  AND ((receipt#>>'{decision,operation}'='release' AND receipt->'reviewSha256'='null'::jsonb)
   OR (receipt#>>'{decision,operation}'<>'release' AND jsonb_typeof(receipt->'reviewSha256')='string'
    AND receipt->>'reviewSha256' ~ '^[a-f0-9]{64}$'))
 ) IS TRUE)
);

CREATE TABLE IF NOT EXISTS os_resource_reservations (
 org_id text NOT NULL REFERENCES os_orgs(id),
 id text NOT NULL CHECK(id ~ '^[A-Za-z0-9_-]{1,100}$'),
 asset_id text NOT NULL CHECK(asset_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 occurrence_id text NOT NULL CHECK(occurrence_id ~ '^[A-Za-z0-9_-]{1,100}$'),
 origin_mode text NOT NULL CHECK(origin_mode IN ('live','recovered')),
 state text NOT NULL CHECK(state IN ('reserved','released')),
 revision integer NOT NULL CHECK(revision IN (1,2)),
 proof jsonb,
 proof_sha256 text NOT NULL CHECK(proof_sha256 ~ '^[a-f0-9]{64}$'),
 original_command_hash text,
 terminal_command_hash text,
 history_core jsonb,
 disposition jsonb,
 PRIMARY KEY(org_id,id),
 FOREIGN KEY(org_id,asset_id) REFERENCES os_records(org_id,id),
 FOREIGN KEY(org_id,occurrence_id) REFERENCES os_records(org_id,id),
 FOREIGN KEY(org_id,original_command_hash) REFERENCES os_resource_reservation_commands(org_id,command_hash) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(org_id,terminal_command_hash) REFERENCES os_resource_reservation_commands(org_id,command_hash) DEFERRABLE INITIALLY DEFERRED,
 CHECK(os_resource_reservation_proof_shape(COALESCE(proof,history_core->'proof'),asset_id,occurrence_id) IS TRUE),
 CHECK((
  (origin_mode='live' AND proof IS NOT NULL AND proof->'orgId'=to_jsonb(org_id)
   AND history_core IS NULL AND disposition IS NULL AND original_command_hash IS NOT NULL
   AND ((state='reserved' AND revision=1 AND terminal_command_hash IS NULL)
    OR (state='released' AND revision=2 AND terminal_command_hash IS NOT NULL
     AND terminal_command_hash<>original_command_hash)))
  OR (origin_mode='recovered' AND proof IS NULL AND original_command_hash IS NULL AND terminal_command_hash IS NULL
   AND jsonb_typeof(history_core)='object'
   AND octet_length((history_core||jsonb_build_object('disposition',disposition))::text)<=8192
   AND history_core ?& ARRAY['version','id','sourceState','proof','original','terminal']
   AND history_core-ARRAY['version','id','sourceState','proof','original','terminal']='{}'::jsonb
   AND history_core->'version'='1'::jsonb AND history_core->'id'=to_jsonb(id)
   AND os_resource_reservation_decision_shape(history_core->'original')
   AND history_core#>'{original,orgId}'=history_core#>'{proof,orgId}'
   AND history_core#>'{original,next,id}'=to_jsonb(id)
   AND history_core#>'{original,next,proofSha256}'=to_jsonb(proof_sha256)
   AND ((history_core->>'sourceState'='released' AND state='released' AND revision=1 AND disposition IS NULL
     AND os_resource_reservation_decision_shape(history_core->'terminal')
     AND history_core#>'{terminal,orgId}'=history_core#>'{proof,orgId}'
     AND history_core#>'{terminal,previous,id}'=to_jsonb(id)
     AND history_core#>'{terminal,previous,proofSha256}'=to_jsonb(proof_sha256)
     AND (history_core#>>'{terminal,acceptedAtExact}')::timestamptz >= (history_core#>>'{original,acceptedAtExact}')::timestamptz)
    OR (history_core->>'sourceState'='reserved' AND history_core->'terminal'='null'::jsonb
     AND ((state='reserved' AND revision=1 AND disposition IS NULL)
      OR (state='released' AND revision=2 AND jsonb_typeof(disposition)='object' AND octet_length(disposition::text)<=2048
       AND disposition ?& ARRAY['orgId','actorSha256','acceptedAtExact','reason']
       AND disposition-ARRAY['orgId','actorSha256','acceptedAtExact','reason']='{}'::jsonb
       AND jsonb_typeof(disposition->'orgId')='string' AND disposition->>'orgId' ~ '^[A-Za-z0-9_-]{1,100}$'
       AND jsonb_typeof(disposition->'actorSha256')='string' AND disposition->>'actorSha256' ~ '^[a-f0-9]{64}$'
       AND jsonb_typeof(disposition->'acceptedAtExact')='string'
       AND disposition->>'acceptedAtExact' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{6}Z$'
       AND (disposition->>'acceptedAtExact')::timestamptz >= (history_core#>>'{original,acceptedAtExact}')::timestamptz
       AND jsonb_typeof(disposition->'reason')='string' AND length(btrim(disposition->>'reason'))>0
       AND length(disposition->>'reason')+length(regexp_replace(disposition->>'reason',U&'[^\+010000-\+10FFFF]','','g'))<=300
       AND disposition->>'reason' !~ '[[:cntrl:]]')))))
 ) IS TRUE)
);

DO $resource_reservation_links$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='os_resource_reservation_commands'::regclass AND conname='os_resource_reservation_previous') THEN
  ALTER TABLE os_resource_reservation_commands ADD CONSTRAINT os_resource_reservation_previous
   FOREIGN KEY(org_id,previous_id) REFERENCES os_resource_reservations(org_id,id) DEFERRABLE INITIALLY DEFERRED;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='os_resource_reservation_commands'::regclass AND conname='os_resource_reservation_next') THEN
  ALTER TABLE os_resource_reservation_commands ADD CONSTRAINT os_resource_reservation_next
   FOREIGN KEY(org_id,next_id) REFERENCES os_resource_reservations(org_id,id) DEFERRABLE INITIALLY DEFERRED;
 END IF;
END $resource_reservation_links$;

CREATE INDEX IF NOT EXISTS os_resource_reservations_asset ON os_resource_reservations(org_id,asset_id,state,origin_mode,id);
CREATE UNIQUE INDEX IF NOT EXISTS os_resource_reservations_live_pair
 ON os_resource_reservations(org_id,asset_id,occurrence_id) WHERE origin_mode='live' AND state='reserved';

ALTER TABLE os_resource_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_resource_reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_resource_reservations;
CREATE POLICY tenant ON os_resource_reservations
 USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));
ALTER TABLE os_resource_reservation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_resource_reservation_commands FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant ON os_resource_reservation_commands;
CREATE POLICY tenant ON os_resource_reservation_commands
 USING(org_id=current_setting('app.org_id',true)) WITH CHECK(org_id=current_setting('app.org_id',true));

CREATE OR REPLACE FUNCTION os_resource_reservation_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE sources_match boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'reservation history is retained' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.origin_mode='live' AND (NEW.state<>'reserved' OR NEW.revision<>1) THEN
   RAISE EXCEPTION 'live reservation must start reserved' USING ERRCODE='23514';
  END IF;
  EXECUTE format(
   'SELECT EXISTS(SELECT 1 FROM %1$I.os_records a JOIN %1$I.os_records e ON e.org_id=a.org_id
    WHERE a.org_id=$1 AND a.id=$2 AND e.id=$3 AND a.module_id=''assets'' AND e.module_id=''events''
    AND ($4=''recovered'' OR (
     a.deleted_at IS NULL AND e.deleted_at IS NULL AND a.data->>''kind''=''asset'' AND e.data->>''kind''=''session''
     AND a.data->''quantity''=''1''::jsonb AND a.revision=($5#>>''{asset,revision}'')::integer
     AND e.revision=($5#>>''{session,revision}'')::integer
     AND to_char(a.created_at AT TIME ZONE ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'')=$5#>>''{asset,createdAtExact}''
     AND to_char(e.created_at AT TIME ZONE ''UTC'',''YYYY-MM-DD"T"HH24:MI:SS.US"Z"'')=$5#>>''{session,createdAtExact}''
     AND e.data->''startAt''=$5#>''{interval,startAt}'' AND e.data->''endAt''=$5#>''{interval,endAt}''
     AND e.data->''timeZone''=$5#>''{interval,timeZone}''
    )))',TG_TABLE_SCHEMA
  ) INTO sources_match USING NEW.org_id,NEW.asset_id,NEW.occurrence_id,NEW.origin_mode,NEW.proof;
  IF sources_match IS NOT TRUE THEN RAISE EXCEPTION 'reservation sources changed or are unavailable' USING ERRCODE='23514'; END IF;
 ELSIF OLD.state<>'reserved' OR OLD.revision<>1 OR NEW.state<>'released' OR NEW.revision<>2
  OR (to_jsonb(NEW)-ARRAY['state','revision','terminal_command_hash','disposition']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['state','revision','terminal_command_hash','disposition'])
  OR (OLD.origin_mode='live' AND (NEW.disposition IS NOT NULL OR NEW.terminal_command_hash IS NULL))
  OR (OLD.origin_mode='recovered' AND (NEW.disposition IS NULL OR NEW.terminal_command_hash IS NOT NULL
   OR NEW.disposition->'orgId' IS DISTINCT FROM to_jsonb(OLD.org_id)))
 THEN RAISE EXCEPTION 'invalid terminal reservation transition' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS resource_reservation_guard ON os_resource_reservations;
CREATE TRIGGER resource_reservation_guard BEFORE INSERT OR UPDATE OR DELETE ON os_resource_reservations
 FOR EACH ROW EXECUTE FUNCTION os_resource_reservation_guard();
DROP TRIGGER IF EXISTS immutable_resource_reservation_command ON os_resource_reservation_commands;
CREATE TRIGGER immutable_resource_reservation_command BEFORE UPDATE OR DELETE ON os_resource_reservation_commands
 FOR EACH ROW EXECUTE FUNCTION os_immutable();

-- Validate both sides at transaction end, including the earlier side of Replace.
CREATE OR REPLACE FUNCTION os_resource_reservation_integrity() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE linked boolean; held record; original record; terminal record;
BEGIN
 IF TG_TABLE_NAME='os_resource_reservation_commands' THEN
  EXECUTE format(
   'SELECT ($2::text IS NULL OR EXISTS(SELECT 1 FROM %1$I.os_resource_reservations r
    WHERE r.org_id=$1 AND r.id=$2 AND r.origin_mode=''live'' AND r.state=''released''
     AND r.terminal_command_hash=$4 AND r.proof_sha256=$5#>>''{decision,previous,proofSha256}''))
   AND ($3::text IS NULL OR EXISTS(SELECT 1 FROM %1$I.os_resource_reservations r
    WHERE r.org_id=$1 AND r.id=$3 AND r.origin_mode=''live''
     AND r.original_command_hash=$4 AND r.proof_sha256=$5#>>''{decision,next,proofSha256}''))',TG_TABLE_SCHEMA
  ) INTO linked USING NEW.org_id,NEW.previous_id,NEW.next_id,NEW.command_hash,NEW.receipt;
 ELSE
  EXECUTE format(
   'SELECT origin_mode,state,proof,proof_sha256,original_command_hash,terminal_command_hash,history_core
    FROM %I.os_resource_reservations WHERE org_id=$1 AND id=$2',TG_TABLE_SCHEMA
  ) INTO STRICT held USING NEW.org_id,NEW.id;
  IF held.origin_mode='recovered' THEN
   EXECUTE format(
    'SELECT ($3#>>''{original,previous,id}'' IS NULL OR EXISTS(SELECT 1 FROM %1$I.os_resource_reservations r
     WHERE r.org_id=$1 AND r.id=$3#>>''{original,previous,id}'' AND r.origin_mode=''recovered''
      AND r.history_core->''terminal''=$3->''original''))
     AND ($3#>>''{terminal,next,id}'' IS NULL OR EXISTS(SELECT 1 FROM %1$I.os_resource_reservations r
     WHERE r.org_id=$1 AND r.id=$3#>>''{terminal,next,id}'' AND r.origin_mode=''recovered''
      AND r.history_core->''original''=$3->''terminal''))',TG_TABLE_SCHEMA
   ) INTO linked USING NEW.org_id,NEW.id,held.history_core;
  ELSE
   EXECUTE format('SELECT next_id,receipt FROM %I.os_resource_reservation_commands WHERE org_id=$1 AND command_hash=$2',
    TG_TABLE_SCHEMA) INTO STRICT original USING NEW.org_id,held.original_command_hash;
   linked := original.next_id=NEW.id AND original.receipt#>>'{decision,next,proofSha256}'=held.proof_sha256
    AND (original.receipt#>>'{decision,acceptedAtExact}')::timestamptz < (held.proof#>>'{interval,startAt}')::timestamptz
    AND (held.proof#>>'{interval,startAt}')::timestamptz < (held.proof#>>'{interval,endAt}')::timestamptz;
   IF held.terminal_command_hash IS NOT NULL THEN
    EXECUTE format('SELECT previous_id,receipt FROM %I.os_resource_reservation_commands WHERE org_id=$1 AND command_hash=$2',
     TG_TABLE_SCHEMA) INTO STRICT terminal USING NEW.org_id,held.terminal_command_hash;
    linked := linked AND terminal.previous_id=NEW.id
     AND terminal.receipt#>>'{decision,previous,proofSha256}'=held.proof_sha256
     AND (terminal.receipt#>>'{decision,acceptedAtExact}')::timestamptz >= (original.receipt#>>'{decision,acceptedAtExact}')::timestamptz;
   END IF;
  END IF;
 END IF;
 IF linked IS NOT TRUE THEN RAISE EXCEPTION 'incomplete reservation history links' USING ERRCODE='23514'; END IF;
 RETURN NULL;
EXCEPTION WHEN no_data_found THEN
 RAISE EXCEPTION 'incomplete reservation history links' USING ERRCODE='23514';
END $$;

DROP TRIGGER IF EXISTS complete_resource_reservation ON os_resource_reservations;
CREATE CONSTRAINT TRIGGER complete_resource_reservation AFTER INSERT OR UPDATE ON os_resource_reservations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION os_resource_reservation_integrity();
DROP TRIGGER IF EXISTS complete_resource_reservation_command ON os_resource_reservation_commands;
CREATE CONSTRAINT TRIGGER complete_resource_reservation_command AFTER INSERT ON os_resource_reservation_commands
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION os_resource_reservation_integrity();
