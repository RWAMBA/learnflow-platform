-- Stage 3 remediation: persist the server-side malware verdict atomically with
-- an instructor application. Existing callers that omit the verdict retain
-- the fail-closed `quarantined` state.

DO $$
BEGIN
  IF to_regclass('public.instructor_application_details') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.instructor_application_details is absent';
  END IF;
  IF to_regprocedure('app_private.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: app_private.submit_public_inquiry is absent';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_private.submit_public_inquiry(
  p_inquiry_type text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_details jsonb,
  p_related_merchandise_id uuid,
  p_fingerprint text,
  p_ip_hash text,
  p_user_agent_family text,
  p_retention_days integer,
  p_instructor jsonb
) RETURNS TABLE (inquiry_id uuid, duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
  v_malware_state text;
BEGIN
  IF p_retention_days IS NULL OR p_retention_days < 1 OR p_retention_days > 3650 THEN
    RAISE EXCEPTION 'VALIDATION: retention_days out of bounds';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_fingerprint || ':' || p_inquiry_type, 0));

  SELECT i.id INTO v_existing
  FROM public.public_inquiries i
  WHERE i.submitter_fingerprint = p_fingerprint
    AND i.inquiry_type = p_inquiry_type
    AND date_trunc('hour', i.created_at AT TIME ZONE 'utc')
        = date_trunc('hour', now() AT TIME ZONE 'utc')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, true;
    RETURN;
  END IF;

  INSERT INTO public.public_inquiries (
    inquiry_type, full_name, email, phone, subject, message, details,
    related_merchandise_id, submitter_fingerprint, ip_hash, user_agent_family, retention_expires_at
  ) VALUES (
    p_inquiry_type, p_full_name, lower(p_email), p_phone, p_subject, p_message,
    COALESCE(p_details, '{}'::jsonb), p_related_merchandise_id, p_fingerprint, p_ip_hash,
    p_user_agent_family, now() + make_interval(days => p_retention_days)
  ) RETURNING id INTO v_id;

  IF p_inquiry_type = 'instructor_application' THEN
    IF p_instructor IS NULL THEN
      RAISE EXCEPTION 'VALIDATION: instructor application details are required';
    END IF;
    v_malware_state := COALESCE(p_instructor ->> 'malware_state', 'quarantined');
    IF v_malware_state NOT IN ('quarantined', 'clean') THEN
      RAISE EXCEPTION 'VALIDATION: invalid initial malware state';
    END IF;
    INSERT INTO public.instructor_application_details (
      inquiry_id, subjects, qualifications_summary, years_experience, document_paths, malware_state
    ) VALUES (
      v_id,
      ARRAY(SELECT jsonb_array_elements_text(p_instructor -> 'subjects')),
      p_instructor ->> 'qualifications_summary',
      (p_instructor ->> 'years_experience')::integer,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_instructor -> 'document_paths')), '{}'),
      v_malware_state
    );
  END IF;

  INSERT INTO public.public_site_audit_log (entity_type, entity_id, action, actor_id, new_state)
  VALUES ('public_inquiries', v_id, 'submitted', NULL, jsonb_build_object('inquiry_type', p_inquiry_type));

  RETURN QUERY SELECT v_id, false;
END;
$$;

REVOKE ALL ON FUNCTION app_private.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)
  TO service_role;

DO $$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef(
    'app_private.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)'::regprocedure
  ) INTO v_definition;
  IF position('malware_state' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'POSTCONDITION: malware verdict is not persisted by submit_public_inquiry';
  END IF;
  IF has_function_privilege('anon',
       'app_private.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)',
       'EXECUTE')
     OR has_function_privilege('authenticated',
       'app_private.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCONDITION: internal submit function is exposed';
  END IF;
END
$$;
