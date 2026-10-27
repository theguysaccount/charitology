CREATE TABLE IF NOT EXISTS newsletter_subscribers (
 email text PRIMARY KEY CHECK(length(email) <= 254),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','confirmed','active','unsubscribed','blocked')),
 generation text NOT NULL,
 contact_id text,
 consent_version text,
 consent_at timestamptz,
 unsubscribed_at timestamptz,
 sync_pending boolean NOT NULL DEFAULT false,
 mail_status text NOT NULL DEFAULT 'none',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_tokens (
 token_hash text PRIMARY KEY CHECK(length(token_hash)=64),
 email text NOT NULL REFERENCES newsletter_subscribers(email) ON DELETE CASCADE,
 generation text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('confirm','unsubscribe')),
 expires_at timestamptz,
 used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS newsletter_tokens_email_idx ON newsletter_tokens(email);
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS topic_attempted_generation text;
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS consent_generation text;
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS contact_import_id text;
ALTER TABLE newsletter_subscribers ADD COLUMN IF NOT EXISTS contact_import_status text NOT NULL DEFAULT 'none';
CREATE TABLE IF NOT EXISTS newsletter_consent_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 email text NOT NULL REFERENCES newsletter_subscribers(email) ON DELETE CASCADE,
 kind text NOT NULL,
 version text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_rate_limits (
 key text PRIMARY KEY,
 hits integer NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter_campaigns (
 edition text PRIMARY KEY,
 content_hash text NOT NULL,
 state text NOT NULL,
 broadcast_id text,
 provider_status text,
 operation_id text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS newsletter_webhook_events (
 id text PRIMARY KEY,
 type text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Transactional OS mail stores hashes and provider IDs, never addresses or bearer URLs.
CREATE TABLE IF NOT EXISTS newsletter_os_mail_intents (
 key_hash text PRIMARY KEY CHECK(length(key_hash)=64),
 payload_hash text NOT NULL CHECK(length(payload_hash)=64),
 purpose text NOT NULL CHECK(purpose IN ('login','invitation','reminder')),
 recipient_hash text NOT NULL CHECK(length(recipient_hash)=64),
 state text NOT NULL CHECK(state IN ('creating','accepted','unknown','failed','limited')),
 provider_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Widen deployed constraints explicitly; CREATE IF NOT EXISTS alone does not.
ALTER TABLE newsletter_os_mail_intents DROP CONSTRAINT IF EXISTS newsletter_os_mail_intents_purpose_check;
ALTER TABLE newsletter_os_mail_intents ADD CONSTRAINT newsletter_os_mail_intents_purpose_check CHECK(purpose IN ('login','invitation','reminder','participation'));
ALTER TABLE newsletter_os_mail_intents DROP CONSTRAINT IF EXISTS newsletter_os_mail_intents_state_check;
ALTER TABLE newsletter_os_mail_intents ADD CONSTRAINT newsletter_os_mail_intents_state_check CHECK(state IN ('creating','accepted','unknown','failed','limited','preflight'));
ALTER TABLE newsletter_os_mail_intents ADD COLUMN IF NOT EXISTS attempted_at timestamptz;
ALTER TABLE newsletter_os_mail_intents ADD COLUMN IF NOT EXISTS correlation_hash text CHECK(correlation_hash IS NULL OR correlation_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE newsletter_os_mail_intents ADD COLUMN IF NOT EXISTS safe_code text CHECK(safe_code IS NULL OR safe_code ~ '^[a-z_]{1,64}$');
ALTER TABLE newsletter_os_mail_intents ADD COLUMN IF NOT EXISTS provider_facts jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(provider_facts)='object' AND octet_length(provider_facts::text)<=2048);
ALTER TABLE newsletter_os_mail_intents DROP CONSTRAINT IF EXISTS newsletter_os_mail_preflight_check;
ALTER TABLE newsletter_os_mail_intents ADD CONSTRAINT newsletter_os_mail_preflight_check CHECK(state<>'preflight' OR(purpose='participation' AND attempted_at IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_os_participation_correlation ON newsletter_os_mail_intents(correlation_hash) WHERE purpose='participation' AND correlation_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_os_participation_provider ON newsletter_os_mail_intents(provider_id) WHERE purpose='participation' AND provider_id IS NOT NULL;

-- R5 is additive: legacy campaign evidence stays nullable and is never backfilled.
CREATE TABLE IF NOT EXISTS newsletter_issue_reviews (
 id text PRIMARY KEY CHECK(id ~ '^[A-Za-z0-9_-]{43}$'),
 method text NOT NULL CHECK(method='newsletter-issue-review-v1'),
 issue_id text NOT NULL CHECK(issue_id ~ '^[a-z][a-z0-9-]{0,79}$'),
 phase text NOT NULL CHECK(phase IN ('prepare','send')),
 preview_hash text NOT NULL CHECK(preview_hash ~ '^[a-f0-9]{64}$'),
 proof_hash text NOT NULL CHECK(proof_hash ~ '^[a-f0-9]{64}$'),
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object' AND octet_length(facts::text)<=4096),
 acknowledgement_hash text NOT NULL CHECK(acknowledgement_hash ~ '^[a-f0-9]{64}$'),
 bearer_hash text NOT NULL CHECK(bearer_hash ~ '^[a-f0-9]{64}$'),
 preview_token_hash text NOT NULL UNIQUE CHECK(preview_token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 consumed_operation_id text,
 CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes'),
 CHECK((consumed_at IS NULL)=(consumed_operation_id IS NULL))
);
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS publication_id text;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS publication_hash text;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS registry_hash text;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS transport_hash text;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS prepare_review_id text REFERENCES newsletter_issue_reviews(id);
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS prepare_review_hash text;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS send_review_id text REFERENCES newsletter_issue_reviews(id);
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS send_review_hash text;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS creating_at timestamptz;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS send_attempted_at timestamptz;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS accepted_at timestamptz;
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS safe_error_code text CHECK(safe_error_code IS NULL OR safe_error_code ~ '^[a-z_]{1,64}$');
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS provider_observation jsonb CHECK(provider_observation IS NULL OR(jsonb_typeof(provider_observation)='object' AND octet_length(provider_observation::text)<=2048));
ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS reserved_bytes integer NOT NULL DEFAULT 0 CHECK(reserved_bytes BETWEEN 0 AND 8192);
-- Duplicate saved IDs stop migration for inspection; they are never deduplicated.
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_campaign_provider_id ON newsletter_campaigns(broadcast_id) WHERE broadcast_id IS NOT NULL;

CREATE OR REPLACE FUNCTION newsletter_protect_campaign() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE proof newsletter_issue_reviews;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Campaign stops cannot be deleted'; END IF;
 IF NEW.edition IS DISTINCT FROM OLD.edition OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.operation_id IS DISTINCT FROM OLD.operation_id OR NEW.publication_id IS DISTINCT FROM OLD.publication_id OR NEW.publication_hash IS DISTINCT FROM OLD.publication_hash OR NEW.registry_hash IS DISTINCT FROM OLD.registry_hash OR NEW.transport_hash IS DISTINCT FROM OLD.transport_hash OR NEW.prepare_review_id IS DISTINCT FROM OLD.prepare_review_id OR NEW.prepare_review_hash IS DISTINCT FROM OLD.prepare_review_hash OR NEW.creating_at IS DISTINCT FROM OLD.creating_at OR NEW.reserved_bytes IS DISTINCT FROM OLD.reserved_bytes THEN RAISE EXCEPTION 'Immutable campaign identity'; END IF;
 IF OLD.broadcast_id IS NOT NULL AND NEW.broadcast_id IS DISTINCT FROM OLD.broadcast_id THEN RAISE EXCEPTION 'Immutable native identity'; END IF;
 IF NEW.broadcast_id IS DISTINCT FROM OLD.broadcast_id AND NOT(OLD.state='creating' AND NEW.state='draft') THEN RAISE EXCEPTION 'Native identity can only bind original create'; END IF;
 IF(NEW.send_review_id,NEW.send_review_hash,NEW.send_attempted_at) IS DISTINCT FROM(OLD.send_review_id,OLD.send_review_hash,OLD.send_attempted_at) AND NOT(OLD.state='draft' AND NEW.state='sending') THEN RAISE EXCEPTION 'Send evidence can only bind original checkpoint'; END IF;
 IF NEW.accepted_at IS DISTINCT FROM OLD.accepted_at AND NOT(OLD.state='sending' AND NEW.state='accepted') THEN RAISE EXCEPTION 'Acceptance can only bind original result'; END IF;
 IF NEW.state=OLD.state THEN
  IF NEW.broadcast_id IS DISTINCT FROM OLD.broadcast_id OR NEW.send_review_id IS DISTINCT FROM OLD.send_review_id OR NEW.send_review_hash IS DISTINCT FROM OLD.send_review_hash OR NEW.send_attempted_at IS DISTINCT FROM OLD.send_attempted_at OR NEW.accepted_at IS DISTINCT FROM OLD.accepted_at THEN RAISE EXCEPTION 'Unbound campaign change'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.state='creating' AND NEW.state='draft' AND OLD.prepare_review_id IS NOT NULL AND NEW.broadcast_id IS NOT NULL THEN
  SELECT * INTO proof FROM newsletter_issue_reviews WHERE id=OLD.prepare_review_id;
  IF proof.consumed_operation_id IS DISTINCT FROM OLD.operation_id OR proof.proof_hash IS DISTINCT FROM OLD.prepare_review_hash OR proof.phase<>'prepare' OR proof.issue_id<>OLD.edition THEN RAISE EXCEPTION 'Unbound create finalization'; END IF;
 ELSIF OLD.state='creating' AND NEW.state='create_unknown' THEN
  IF NEW.broadcast_id IS DISTINCT FROM OLD.broadcast_id THEN RAISE EXCEPTION 'Unknown create cannot adopt identity'; END IF;
 ELSIF OLD.state='draft' AND NEW.state='sending' AND OLD.broadcast_id IS NOT NULL AND NEW.send_review_id IS NOT NULL AND NEW.send_attempted_at IS NOT NULL THEN
  SELECT * INTO proof FROM newsletter_issue_reviews WHERE id=NEW.send_review_id;
  IF proof.consumed_operation_id IS DISTINCT FROM OLD.operation_id OR proof.proof_hash IS DISTINCT FROM NEW.send_review_hash OR proof.phase<>'send' OR proof.issue_id<>OLD.edition THEN RAISE EXCEPTION 'Unbound send checkpoint'; END IF;
 ELSIF OLD.state='sending' AND NEW.state IN ('accepted','send_unknown') AND OLD.send_review_id IS NOT NULL THEN
  IF NEW.send_review_id IS DISTINCT FROM OLD.send_review_id OR NEW.send_review_hash IS DISTINCT FROM OLD.send_review_hash OR NEW.send_attempted_at IS DISTINCT FROM OLD.send_attempted_at OR(NEW.state='accepted' AND NEW.accepted_at IS NULL) THEN RAISE EXCEPTION 'Unbound send finalization'; END IF;
 ELSE RAISE EXCEPTION 'Campaign state is stopped'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS newsletter_campaign_immutable ON newsletter_campaigns;
CREATE TRIGGER newsletter_campaign_immutable BEFORE UPDATE OR DELETE ON newsletter_campaigns FOR EACH ROW EXECUTE FUNCTION newsletter_protect_campaign();

CREATE OR REPLACE FUNCTION newsletter_protect_issue_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.consumed_at IS NOT NULL OR OLD.expires_at>now() THEN RAISE EXCEPTION 'Referenced or live review must be retained'; END IF;
  RETURN OLD;
 END IF;
 IF(NEW.id,NEW.method,NEW.issue_id,NEW.phase,NEW.preview_hash,NEW.proof_hash,NEW.facts,NEW.acknowledgement_hash,NEW.bearer_hash,NEW.preview_token_hash,NEW.created_at,NEW.expires_at) IS DISTINCT FROM(OLD.id,OLD.method,OLD.issue_id,OLD.phase,OLD.preview_hash,OLD.proof_hash,OLD.facts,OLD.acknowledgement_hash,OLD.bearer_hash,OLD.preview_token_hash,OLD.created_at,OLD.expires_at) OR OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL OR NEW.consumed_operation_id IS NULL THEN RAISE EXCEPTION 'Immutable operational proof'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS newsletter_issue_review_immutable ON newsletter_issue_reviews;
CREATE TRIGGER newsletter_issue_review_immutable BEFORE UPDATE OR DELETE ON newsletter_issue_reviews FOR EACH ROW EXECUTE FUNCTION newsletter_protect_issue_review();
