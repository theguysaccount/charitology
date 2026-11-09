-- Expiring own willingness is separate from an immutable staff decision.
CREATE TABLE IF NOT EXISTS os_participation_substitution_choices (
 org_id text NOT NULL REFERENCES os_orgs(id),
 intent_id text NOT NULL,
 party text NOT NULL,
 shift_id text NOT NULL,
 shift_revision integer NOT NULL,
 participation_id text NOT NULL,
 participation_revision integer NOT NULL,
 user_id text NOT NULL,
 intake_id text NOT NULL,
 link_id text NOT NULL,
 link_revision integer NOT NULL,
 person_identity_sha256 text NOT NULL,
 link_scope_sha256 text NOT NULL,
 accepted_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 withdrawn_at timestamptz,
 own_authority_sha256 text NOT NULL,
 PRIMARY KEY(org_id,intent_id,party),
 CONSTRAINT os_substitution_choice_shift FOREIGN KEY(org_id,shift_id)
  REFERENCES os_participation_targets(org_id,target_id),
 CONSTRAINT os_substitution_choice_participation FOREIGN KEY(org_id,participation_id)
  REFERENCES os_participations(org_id,id),
 CONSTRAINT os_substitution_choice_own_link FOREIGN KEY(user_id,org_id,intake_id)
  REFERENCES os_participant_links(user_id,org_id,intake_id),
 CONSTRAINT os_substitution_choice_shape CHECK (
  party IN ('leaving','joining')
  AND org_id ~ '^[A-Za-z0-9_-]{1,100}$' AND intent_id ~ '^[A-Za-z0-9_-]{1,100}$'
  AND shift_id ~ '^[A-Za-z0-9_-]{1,100}$' AND participation_id ~ '^[A-Za-z0-9_-]{1,100}$'
  AND user_id ~ '^[A-Za-z0-9_-]{1,100}$' AND intake_id ~ '^[A-Za-z0-9_-]{1,100}$'
  AND link_id ~ '^[a-f0-9]{32}$'
  AND shift_revision>0 AND participation_revision>0 AND link_revision>0
  AND person_identity_sha256 ~ '^[a-f0-9]{64}$' AND link_scope_sha256 ~ '^[a-f0-9]{64}$'
  AND own_authority_sha256 ~ '^[a-f0-9]{64}$'
  AND isfinite(accepted_at) AND isfinite(expires_at)
  AND expires_at>accepted_at AND expires_at-accepted_at<=interval '10 minutes'
  AND (withdrawn_at IS NULL OR (isfinite(withdrawn_at) AND withdrawn_at>=accepted_at))
 )
);
CREATE INDEX IF NOT EXISTS os_substitution_choice_expiry
 ON os_participation_substitution_choices(org_id,expires_at,intent_id,party);
CREATE UNIQUE INDEX IF NOT EXISTS os_substitution_accepted_intent
 ON os_reports(org_id,(payload#>>'{scope,intentId}'))
 WHERE payload->>'format'='charitology-volunteer-substitution-receipt';

ALTER TABLE os_participation_substitution_choices ENABLE ROW LEVEL SECURITY;
ALTER TABLE os_participation_substitution_choices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS substitution_choice_read ON os_participation_substitution_choices;
CREATE POLICY substitution_choice_read ON os_participation_substitution_choices FOR SELECT
 USING (org_id=current_setting('app.org_id',true));
DROP POLICY IF EXISTS substitution_choice_insert ON os_participation_substitution_choices;
CREATE POLICY substitution_choice_insert ON os_participation_substitution_choices FOR INSERT
 WITH CHECK (org_id=current_setting('app.org_id',true) AND user_id=current_setting('app.user_id',true));
DROP POLICY IF EXISTS substitution_choice_withdraw ON os_participation_substitution_choices;
CREATE POLICY substitution_choice_withdraw ON os_participation_substitution_choices FOR UPDATE
 USING (org_id=current_setting('app.org_id',true) AND user_id=current_setting('app.user_id',true))
 WITH CHECK (org_id=current_setting('app.org_id',true) AND user_id=current_setting('app.user_id',true));
DROP POLICY IF EXISTS substitution_choice_expire ON os_participation_substitution_choices;
CREATE POLICY substitution_choice_expire ON os_participation_substitution_choices FOR DELETE
 USING (org_id=current_setting('app.org_id',true) AND expires_at<=statement_timestamp());

CREATE OR REPLACE FUNCTION os_substitution_choice_guard() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE authority_sha256 text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.expires_at>statement_timestamp() THEN
   RAISE EXCEPTION 'current substitution choice is retained' USING ERRCODE='23514';
  END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.withdrawn_at IS NOT NULL OR NEW.withdrawn_at IS NULL
   OR NEW.withdrawn_at<transaction_timestamp() OR NEW.withdrawn_at>clock_timestamp()
   OR octet_length(to_jsonb(NEW)::text)>2048
   OR (to_jsonb(NEW)-'withdrawn_at') IS DISTINCT FROM (to_jsonb(OLD)-'withdrawn_at') THEN
   RAISE EXCEPTION 'only a terminal substitution withdrawal can change a choice' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.own_authority_sha256 IS NOT NULL OR NEW.withdrawn_at IS NOT NULL
  OR NEW.accepted_at<transaction_timestamp() OR NEW.accepted_at>clock_timestamp()
  OR NEW.org_id IS DISTINCT FROM current_setting('app.org_id',true)
  OR NEW.expires_at<=clock_timestamp()
  OR NEW.user_id IS DISTINCT FROM current_setting('app.user_id',true) THEN
  RAISE EXCEPTION 'substitution choice needs its current own context' USING ERRCODE='23514';
 END IF;
 EXECUTE format(
  'SELECT encode(sha256(convert_to(jsonb_build_array(
    ''charitology-substitution-own-authority-v1'',l.id,l.org_id,l.intake_id,l.publication_id,l.user_id,l.revision,
    extract(epoch FROM l.created_at),extract(epoch FROM l.updated_at),i.revision,extract(epoch FROM i.created_at),
    extract(epoch FROM u."createdAt"),extract(epoch FROM u."updatedAt")
   )::text,''UTF8'')),''hex'')
   FROM %1$I.os_participations p
   JOIN %1$I.os_participation_targets t ON t.org_id=p.org_id AND t.target_id=p.target_id
   JOIN %1$I.os_records s ON s.org_id=p.org_id AND s.id=t.target_id
   JOIN %1$I.os_records b ON b.org_id=p.org_id AND b.id=p.booking_record_id
   JOIN %1$I.os_intake i ON i.org_id=p.org_id AND i.id=p.intake_id
   JOIN %1$I.os_publications f ON f.org_id=i.org_id AND f.id=i.publication_id
   JOIN %1$I.os_participant_links l ON l.org_id=i.org_id AND l.intake_id=i.id AND l.publication_id=f.id
   JOIN %1$I."user" u ON u.id=l.user_id
   WHERE p.org_id=$1 AND p.id=$2 AND p.target_id=$3 AND p.revision=$4
   AND p.module_id=''volunteers'' AND p.source=''intake'' AND NOT p.recovered AND p.requested_interval IS NULL
   AND p.state=CASE WHEN $5=''leaving'' THEN ''confirmed'' ELSE ''waitlisted'' END
   AND t.module_id=''volunteers'' AND t.mode=''managed'' AND NOT t.recovery_block AND t.source_revision=$6
   AND s.module_id=''volunteers'' AND s.data->>''kind''=''shift'' AND s.status=''open'' AND s.deleted_at IS NULL
   AND s.revision=$6 AND s.approval->>''status''=''approved'' AND s.approval->''revision''=to_jsonb(s.revision)
   AND s.approval->>''actorId''<>s.last_editor_id AND (s.data->>''startAt'')::timestamptz>$7
   AND b.module_id=''volunteers'' AND b.data->>''kind''=''assignment'' AND b.deleted_at IS NULL
   AND b.data->>''shiftId''=s.id AND b.data->>''contactId''=p.contact_id
   AND b.status=CASE WHEN $5=''leaving'' THEN ''assigned'' ELSE ''approved'' END
   AND i.id=$8 AND i.status=''converted'' AND i.cancelled_at IS NULL AND i.erased_at IS NULL
   AND i.converted_ids @> jsonb_build_array(jsonb_build_object(''id'',b.id,''moduleId'',''volunteers''),
       jsonb_build_object(''id'',p.contact_id,''moduleId'',''contacts''))
   AND f.kind=''volunteer-interest'' AND f.target_module=''volunteers'' AND f.target_id=s.id
   AND l.user_id=$9 AND l.id=$10 AND l.revision=$11 AND l.revoked_at IS NULL AND u."emailVerified" IS TRUE
   AND isfinite(l.created_at) AND isfinite(l.updated_at) AND isfinite(i.created_at)
   AND isfinite(u."createdAt") AND isfinite(u."updatedAt")
   AND length(btrim(u.email)) BETWEEN 3 AND 254 AND lower(btrim(u.email))=lower(btrim(i.answers->>''email''))
   AND ($5=''leaving'' OR EXISTS(SELECT 1 FROM %1$I.os_participation_substitution_choices original
    JOIN %1$I.os_participations previous ON previous.org_id=original.org_id AND previous.id=original.participation_id
    WHERE original.org_id=$1 AND original.intent_id=$12 AND original.party=''leaving''
    AND original.shift_id=$3 AND original.shift_revision=$6 AND original.participation_id<>$2
    AND original.user_id<>$9 AND original.link_id<>$10 AND original.intake_id<>$8
    AND original.person_identity_sha256<>$13 AND original.link_scope_sha256<>$14
    AND previous.target_id=original.shift_id AND previous.intake_id=original.intake_id
    AND previous.state=''confirmed'' AND previous.revision=original.participation_revision AND NOT previous.recovered
    AND original.withdrawn_at IS NULL AND original.accepted_at<=$7 AND original.expires_at>clock_timestamp()))',TG_TABLE_SCHEMA)
 INTO authority_sha256 USING NEW.org_id,NEW.participation_id,NEW.shift_id,NEW.participation_revision,NEW.party,
  NEW.shift_revision,NEW.accepted_at,NEW.intake_id,NEW.user_id,NEW.link_id,NEW.link_revision,NEW.intent_id,
  NEW.person_identity_sha256,NEW.link_scope_sha256;
 IF authority_sha256 IS NULL THEN
  RAISE EXCEPTION 'substitution choice source changed' USING ERRCODE='23514';
 END IF;
 NEW.own_authority_sha256:=authority_sha256;
 IF octet_length(to_jsonb(NEW)::text)>2048 THEN
  RAISE EXCEPTION 'substitution choice exceeds its retained bound' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS os_substitution_choice_guard ON os_participation_substitution_choices;
CREATE TRIGGER os_substitution_choice_guard BEFORE INSERT OR UPDATE OR DELETE ON os_participation_substitution_choices
 FOR EACH ROW EXECUTE FUNCTION os_substitution_choice_guard();
