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
