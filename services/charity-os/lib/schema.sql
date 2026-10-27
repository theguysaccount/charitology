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
