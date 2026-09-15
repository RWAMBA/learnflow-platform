-- Stage 3 remediation: make the malware verdict authoritative and implement
-- real, scheduled retention. This migration is additive and forward-only; no
-- applied migration is edited.

DO $$
BEGIN
  IF to_regclass('public.public_inquiries') IS NULL
     OR to_regclass('public.instructor_application_details') IS NULL
     OR to_regclass('public.newsletter_subscriptions') IS NULL
     OR to_regclass('public.newsletter_consent_events') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: Stage 3 retention tables are absent';
  END IF;
  IF to_regprocedure('public.purge_expired_public_submissions()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: Stage 3 retention function is absent';
  END IF;
END
$$;

-- Platform Administrators may make recruitment decisions, but the document
-- identity and scanner verdict are service-controlled evidence.
REVOKE UPDATE ON public.instructor_application_details FROM authenticated;
GRANT UPDATE (application_status, decision_note) ON public.instructor_application_details TO authenticated;

-- Newsletter state is changed only by the service-only double-opt-in and
-- retention RPCs. The CMS exposes this table read-only.
REVOKE UPDATE ON public.newsletter_subscriptions FROM authenticated;

CREATE OR REPLACE FUNCTION app_private.enforce_instructor_application_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_type text; v_expired boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT inquiry_type INTO v_type FROM public.public_inquiries WHERE id = NEW.inquiry_id;
    IF v_type IS DISTINCT FROM 'instructor_application' THEN
      RAISE EXCEPTION 'CONSISTENCY: linked inquiry must be of type instructor_application';
    END IF;
    RETURN NEW;
  END IF;

  SELECT (retention_expires_at < now()) INTO v_expired
  FROM public.public_inquiries WHERE id = OLD.inquiry_id;

  -- Exact, irreversible retention transformation. No ordinary administrator
  -- update can use this exception before the parent record expires.
  IF v_expired IS TRUE
     AND NEW.inquiry_id = OLD.inquiry_id
     AND NEW.subjects = ARRAY['[redacted]']::text[]
     AND NEW.qualifications_summary = '[redacted after retention]'
     AND NEW.years_experience = 0
     AND NEW.document_paths = '{}'::text[]
     AND NEW.malware_state = 'quarantined'
     AND NEW.application_status = OLD.application_status
     AND NEW.decided_by IS NULL
     AND NEW.decided_at IS NULL
     AND NEW.decision_note IS NULL
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;

  IF NEW.inquiry_id IS DISTINCT FROM OLD.inquiry_id
     OR NEW.subjects IS DISTINCT FROM OLD.subjects
     OR NEW.qualifications_summary IS DISTINCT FROM OLD.qualifications_summary
     OR NEW.years_experience IS DISTINCT FROM OLD.years_experience
     OR NEW.document_paths IS DISTINCT FROM OLD.document_paths
     OR NEW.malware_state IS DISTINCT FROM OLD.malware_state
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE: submitted applicant and scan-evidence fields cannot be modified';
  END IF;

  IF NEW.application_status IS DISTINCT FROM OLD.application_status THEN
    IF OLD.application_status IN ('accepted','declined','withdrawn') THEN
      RAISE EXCEPTION 'LIFECYCLE: a decided application cannot change status';
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
    INSERT INTO public.public_site_audit_log
      (entity_type, entity_id, action, actor_id, previous_state, new_state)
    VALUES ('instructor_application_details', OLD.id, 'decision', auth.uid(),
            jsonb_build_object('application_status', OLD.application_status),
            jsonb_build_object('application_status', NEW.application_status));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.enforce_instructor_application_rules() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.enforce_public_inquiry_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Permit only the canonical retention tombstone after expiry.
  IF OLD.retention_expires_at < now()
     AND NEW.inquiry_type = OLD.inquiry_type
     AND NEW.full_name = '[redacted]'
     AND NEW.email = 'redacted+' || OLD.id::text || '@invalid.invalid'
     AND NEW.phone IS NULL
     AND NEW.subject IS NULL
     AND NEW.message = '[redacted after retention]'
     AND NEW.details = '{}'::jsonb
     AND NEW.related_merchandise_id IS NULL
     AND NEW.submitter_fingerprint = repeat('0', 64)
     AND NEW.ip_hash = repeat('0', 64)
     AND NEW.user_agent_family IS NULL
     AND NEW.status = 'closed'
     AND NEW.handled_by IS NULL
     AND NEW.handling_note = 'retention expired'
     AND NEW.retention_expires_at = OLD.retention_expires_at
     AND NEW.created_at = OLD.created_at THEN
    RETURN NEW;
  END IF;

  IF NEW.inquiry_type IS DISTINCT FROM OLD.inquiry_type
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.related_merchandise_id IS DISTINCT FROM OLD.related_merchandise_id
     OR NEW.submitter_fingerprint IS DISTINCT FROM OLD.submitter_fingerprint
     OR NEW.ip_hash IS DISTINCT FROM OLD.ip_hash
     OR NEW.user_agent_family IS DISTINCT FROM OLD.user_agent_family
     OR NEW.retention_expires_at IS DISTINCT FROM OLD.retention_expires_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE: submitted inquiry content cannot be modified';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
      RAISE EXCEPTION 'LIFECYCLE: a closed inquiry cannot be reopened';
    END IF;
    NEW.handled_at := now();
    NEW.handled_by := auth.uid();
    INSERT INTO public.public_site_audit_log
      (entity_type, entity_id, action, actor_id, previous_state, new_state)
    VALUES ('public_inquiries', OLD.id, 'status_change', auth.uid(),
            jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.enforce_public_inquiry_immutability() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.reject_newsletter_consent_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.subscription_id = OLD.subscription_id
     AND NEW.event_type = OLD.event_type
     AND NEW.consent_text IS NOT DISTINCT FROM OLD.consent_text
     AND NEW.consent_text_version IS NOT DISTINCT FROM OLD.consent_text_version
     AND NEW.policy_version IS NOT DISTINCT FROM OLD.policy_version
     AND NEW.actor_id IS NULL
     AND NEW.evidence = '{}'::jsonb
     AND NEW.occurred_at = OLD.occurred_at
     AND EXISTS (
       SELECT 1 FROM public.newsletter_subscriptions n
       WHERE n.id = OLD.subscription_id
         AND n.state = 'suppressed'
         AND n.retention_expires_at < now()
         AND n.email_normalized = 'redacted+' || n.id::text || '@invalid.invalid'
     ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'newsletter_consent_events is append-only';
END;
$$;
REVOKE ALL ON FUNCTION app_private.reject_newsletter_consent_mutation() FROM PUBLIC, anon, authenticated;

-- Storage read authority now includes the scanner verdict and attachment
-- relationship. Knowing or guessing a path is insufficient.
DROP POLICY IF EXISTS instructor_applications_platform_admin_read ON storage.objects;
CREATE POLICY instructor_applications_platform_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'instructor-applications'
    AND app_private.is_platform_admin()
    AND EXISTS (
      SELECT 1
      FROM public.instructor_application_details d
      WHERE d.malware_state = 'clean'
        AND storage.objects.name = ANY(d.document_paths)
    )
  );

-- p_inquiry_ids certifies that the scheduler removed those rows' private
-- objects through the Storage API. Document-bearing applications not present
-- in the list are never redacted, so their paths cannot be orphaned silently.
CREATE OR REPLACE FUNCTION app_private.finalize_public_retention(p_inquiry_ids uuid[])
RETURNS TABLE (inquiries_redacted integer, newsletters_redacted integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_i integer := 0; v_n integer := 0;
BEGIN
  IF p_inquiry_ids IS NULL OR cardinality(p_inquiry_ids) > 500
     OR array_position(p_inquiry_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'VALIDATION: inquiry retention batch is invalid';
  END IF;

  UPDATE public.instructor_application_details d
     SET subjects = ARRAY['[redacted]']::text[],
         qualifications_summary = '[redacted after retention]',
         years_experience = 0,
         document_paths = '{}'::text[],
         malware_state = 'quarantined',
         decided_by = NULL,
         decided_at = NULL,
         decision_note = NULL
    FROM public.public_inquiries i
   WHERE i.id = d.inquiry_id
     AND i.retention_expires_at < now()
     AND (
       cardinality(d.document_paths) = 0
       OR i.id = ANY(p_inquiry_ids)
     )
     AND (
       d.subjects IS DISTINCT FROM ARRAY['[redacted]']::text[]
       OR d.qualifications_summary IS DISTINCT FROM '[redacted after retention]'
       OR d.document_paths IS DISTINCT FROM '{}'::text[]
       OR d.decided_by IS NOT NULL
       OR d.decision_note IS NOT NULL
     );

  UPDATE public.public_inquiries i
     SET full_name = '[redacted]',
         email = 'redacted+' || i.id::text || '@invalid.invalid',
         phone = NULL,
         subject = NULL,
         message = '[redacted after retention]',
         details = '{}'::jsonb,
         related_merchandise_id = NULL,
         submitter_fingerprint = repeat('0', 64),
         ip_hash = repeat('0', 64),
         user_agent_family = NULL,
         status = 'closed',
         handled_by = NULL,
         handled_at = now(),
         handling_note = 'retention expired'
   WHERE i.retention_expires_at < now()
     AND i.email NOT LIKE 'redacted+%@invalid.invalid'
     AND (
       i.inquiry_type <> 'instructor_application'
       OR NOT EXISTS (
         SELECT 1 FROM public.instructor_application_details d
         WHERE d.inquiry_id = i.id AND cardinality(d.document_paths) > 0
       )
     );
  GET DIAGNOSTICS v_i = ROW_COUNT;

  UPDATE public.newsletter_subscriptions n
     SET email_normalized = 'redacted+' || n.id::text || '@invalid.invalid',
         state = 'suppressed',
         confirmation_token_hash = NULL,
         token_expires_at = NULL,
         unsubscribed_at = NULL,
         suppressed_at = COALESCE(n.suppressed_at, now()),
         suppression_reason = 'retention expired'
   WHERE n.retention_expires_at IS NOT NULL
     AND n.retention_expires_at < now()
     AND n.email_normalized NOT LIKE 'redacted+%@invalid.invalid';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  UPDATE public.newsletter_consent_events e
     SET actor_id = NULL, evidence = '{}'::jsonb
   WHERE EXISTS (
     SELECT 1 FROM public.newsletter_subscriptions n
     WHERE n.id = e.subscription_id
       AND n.retention_expires_at < now()
       AND n.email_normalized = 'redacted+' || n.id::text || '@invalid.invalid'
   )
     AND (e.actor_id IS NOT NULL OR e.evidence <> '{}'::jsonb);

  IF v_i > 0 OR v_n > 0 THEN
    INSERT INTO public.public_site_audit_log (entity_type, entity_id, action, new_state)
    VALUES ('retention', gen_random_uuid(), 'redacted',
            jsonb_build_object('inquiries', v_i, 'newsletters', v_n));
  END IF;

  RETURN QUERY SELECT v_i, v_n;
END;
$$;
REVOKE ALL ON FUNCTION app_private.finalize_public_retention(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.finalize_public_retention(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_public_retention(p_inquiry_ids uuid[])
RETURNS TABLE (inquiries_redacted integer, newsletters_redacted integer)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM app_private.finalize_public_retention(p_inquiry_ids);
$$;
REVOKE ALL ON FUNCTION public.finalize_public_retention(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_public_retention(uuid[]) TO service_role;

-- Preserve the existing maintenance contract. Direct calls safely process
-- ordinary inquiries, document-free applications and newsletter records.
CREATE OR REPLACE FUNCTION public.purge_expired_public_submissions()
RETURNS TABLE (inquiries_redacted integer, newsletters_purged integer)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT inquiries_redacted, newsletters_redacted
  FROM app_private.finalize_public_retention('{}'::uuid[]);
$$;
REVOKE ALL ON FUNCTION public.purge_expired_public_submissions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_public_submissions() TO service_role;

DO $$
BEGIN
  IF has_table_privilege('authenticated', 'public.instructor_application_details', 'UPDATE') THEN
    RAISE EXCEPTION 'POSTCONDITION: authenticated retains table-wide application UPDATE';
  END IF;
  IF has_column_privilege('authenticated', 'public.instructor_application_details', 'malware_state', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.instructor_application_details', 'document_paths', 'UPDATE') THEN
    RAISE EXCEPTION 'POSTCONDITION: scan evidence remains directly mutable';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.instructor_application_details', 'application_status', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.instructor_application_details', 'decision_note', 'UPDATE') THEN
    RAISE EXCEPTION 'POSTCONDITION: administrator decision columns are not writable';
  END IF;
  IF has_function_privilege('anon', 'public.finalize_public_retention(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalize_public_retention(uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.finalize_public_retention(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCONDITION: retention RPC privilege boundary is incorrect';
  END IF;
END
$$;
