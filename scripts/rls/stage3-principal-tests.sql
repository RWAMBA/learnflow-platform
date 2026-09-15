-- Phase 10 Stage 3 — public website live-principal RLS proof.
-- DISPOSABLE DATABASES ONLY. Every fixture is wrapped in this transaction and
-- the script always rolls back.
BEGIN;
SET LOCAL client_min_messages = warning;

DO $stage3$
DECLARE
  v_admin uuid := gen_random_uuid();
  v_member uuid := gen_random_uuid();
  v_published uuid;
  v_draft uuid;
  v_inquiry uuid := gen_random_uuid();
  v_application_inquiry uuid := gen_random_uuid();
  v_application uuid := gen_random_uuid();
  v_expired_contact uuid := gen_random_uuid();
  v_expired_application_inquiry uuid := gen_random_uuid();
  v_expired_application uuid := gen_random_uuid();
  v_newsletter uuid := gen_random_uuid();
  v_clean_object uuid := gen_random_uuid();
  v_quarantined_object uuid := gen_random_uuid();
  v_unattached_object uuid := gen_random_uuid();
  v_count integer;
  v_rows integer;
  v_inquiries_redacted integer;
  v_newsletters_redacted integer;
  v_orphan_path text;
BEGIN
  IF to_regclass('public.site_content') IS NULL
     OR to_regclass('public.public_inquiries') IS NULL
     OR to_regprocedure('public.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Stage 3 objects are not applied in this disposable database';
  END IF;

  INSERT INTO auth.users (id, email) VALUES
    (v_admin, 's3-admin@example.test'),
    (v_member, 's3-member@example.test');
  INSERT INTO public.profiles (id, full_name) VALUES
    (v_admin, 'Stage 3 Admin'),
    (v_member, 'Stage 3 Member')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.platform_admins (user_id, created_by) VALUES (v_admin, v_admin);

  INSERT INTO storage.buckets (id, name, public)
  VALUES ('instructor-applications', 'instructor-applications', false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.site_content
    (content_key, page_slug, title, body_markdown, status, created_by, updated_by)
  VALUES
    ('s3-proof-published', 's3-proof', 'Published proof', 'Published', 'draft', v_admin, v_admin)
  RETURNING id INTO v_published;
  UPDATE public.site_content SET status = 'published' WHERE id = v_published;

  INSERT INTO public.site_content
    (content_key, page_slug, title, body_markdown, status, created_by, updated_by)
  VALUES
    ('s3-proof-draft', 's3-proof', 'Draft proof', 'Draft', 'draft', v_admin, v_admin)
  RETURNING id INTO v_draft;

  INSERT INTO public.public_inquiries
    (id, inquiry_type, full_name, email, message, submitter_fingerprint, ip_hash,
     retention_expires_at)
  VALUES
    (v_inquiry, 'contact', 'Stage Three Proof', 's3-proof@example.test', 'Proof message',
     repeat('a', 64), repeat('b', 64), now() + interval '1 day');

  INSERT INTO public.public_inquiries
    (id, inquiry_type, full_name, email, message, submitter_fingerprint, ip_hash,
     retention_expires_at)
  VALUES
    (v_application_inquiry, 'instructor_application', 'Stage Three Applicant',
     's3-applicant@example.test', 'Application proof message', repeat('c', 64), repeat('d', 64),
     now() + interval '1 day'),
    (v_expired_contact, 'contact', 'Expired Contact', 's3-expired@example.test',
     'Expired contact proof message', repeat('e', 64), repeat('f', 64), now() - interval '1 day'),
    (v_expired_application_inquiry, 'instructor_application', 'Expired Applicant',
     's3-expired-applicant@example.test', 'Expired application proof message', repeat('1', 64),
     repeat('2', 64), now() - interval '1 day');

  INSERT INTO public.instructor_application_details
    (id, inquiry_id, subjects, qualifications_summary, years_experience, document_paths,
     malware_state)
  VALUES
    (v_application, v_application_inquiry, ARRAY['Mathematics'], 'Qualified proof applicant', 5,
     ARRAY['applications/00000000-0000-0000-0000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf'],
     'clean'),
    (v_expired_application, v_expired_application_inquiry, ARRAY['Science'],
     'Expired qualified applicant', 7,
     ARRAY['applications/00000000-0000-0000-0000-000000000002/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf'],
     'quarantined');

  INSERT INTO storage.objects (id, bucket_id, name, owner) VALUES
    (v_clean_object, 'instructor-applications',
     'applications/00000000-0000-0000-0000-000000000001/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pdf',
     v_admin),
    (v_quarantined_object, 'instructor-applications',
     'applications/00000000-0000-0000-0000-000000000002/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.pdf',
     v_admin),
    (v_unattached_object, 'instructor-applications',
     'applications/00000000-0000-0000-0000-000000000003/cccccccccccccccccccccccccccccccc.pdf',
     v_admin);

  UPDATE storage.objects
     SET created_at = now() - interval '25 hours'
   WHERE id IN (v_clean_object, v_unattached_object);

  INSERT INTO public.newsletter_subscriptions
    (id, email_normalized, state, confirmed_at, consent_text_version, policy_version,
     retention_expires_at)
  VALUES
    (v_newsletter, 's3-newsletter@example.test', 'confirmed', now() - interval '2 days',
     'proof-v1', 'proof-v1', now() - interval '1 day');
  INSERT INTO public.newsletter_consent_events
    (subscription_id, event_type, consent_text, actor_id, evidence)
  VALUES
    (v_newsletter, 'confirmed', 'Proof consent', v_admin,
     jsonb_build_object('network', 'sensitive-proof'));

  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT count(*) INTO v_count FROM public.site_content
   WHERE id IN (v_published, v_draft);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS FAILED: anon must see exactly the published content row, saw %', v_count;
  END IF;
  BEGIN
    INSERT INTO public.site_content (content_key, page_slug, title)
    VALUES ('s3-anon-write', 's3-proof', 'Denied');
    RAISE EXCEPTION 'DENY FAILED: anon inserted public content';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT count(*) INTO v_count FROM public.public_inquiries WHERE id = v_inquiry;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: anon read a private inquiry';
  END IF;

  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.site_content
   WHERE id IN (v_published, v_draft);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RLS FAILED: ordinary authenticated principal saw draft content';
  END IF;
  UPDATE public.site_content SET title = 'Denied' WHERE id = v_published;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: ordinary authenticated principal updated content';
  END IF;
  SELECT count(*) INTO v_count FROM public.public_inquiries WHERE id = v_inquiry;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RLS FAILED: ordinary authenticated principal read a private inquiry';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.site_content
   WHERE id IN (v_published, v_draft);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'RLS FAILED: Platform Administrator cannot read all content';
  END IF;
  UPDATE public.site_content SET title = 'Reviewed proof' WHERE id = v_draft;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: Platform Administrator could not update draft content';
  END IF;
  SELECT count(*) INTO v_count FROM public.public_inquiries WHERE id = v_inquiry;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: Platform Administrator cannot read private inquiries';
  END IF;
  SELECT count(*) INTO v_count
    FROM storage.objects
   WHERE id IN (v_clean_object, v_quarantined_object, v_unattached_object);
  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'STORAGE RLS FAILED: Platform Administrator must see only the attached clean object, saw %',
      v_count;
  END IF;
  SELECT count(*) INTO v_count
    FROM storage.objects
   WHERE id = v_clean_object;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'STORAGE ALLOW FAILED: attached clean instructor document is not readable';
  END IF;
  SELECT count(*) INTO v_count
    FROM storage.objects
   WHERE id IN (v_quarantined_object, v_unattached_object);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'STORAGE DENY FAILED: quarantined or unattached instructor document is readable';
  END IF;

  BEGIN
    UPDATE public.instructor_application_details
       SET malware_state = 'quarantined'
     WHERE id = v_application;
    RAISE EXCEPTION 'DENY FAILED: Platform Administrator changed malware state directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.instructor_application_details
       SET document_paths = '{}'::text[]
     WHERE id = v_application;
    RAISE EXCEPTION 'DENY FAILED: Platform Administrator changed document paths directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.instructor_application_details
     SET application_status = 'screening', decision_note = 'Reviewed proof'
   WHERE id = v_application;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: Platform Administrator could not make an application decision';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'instructor_applications_platform_admin_read'
      AND qual LIKE '%malware_state%clean%'
      AND qual LIKE '%document_paths%'
  ) THEN
    RAISE EXCEPTION 'POLICY FAILED: Storage reads are not bound to attached clean documents';
  END IF;

  IF has_function_privilege('anon',
       'public.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)',
       'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'PRIVILEGE FAILED: public write RPC is callable outside service_role';
  END IF;
  IF NOT has_function_privilege('service_role',
       'public.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'PRIVILEGE FAILED: service_role cannot call public write RPC';
  END IF;

  IF has_function_privilege('anon', 'public.finalize_public_retention(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalize_public_retention(uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.finalize_public_retention(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRIVILEGE FAILED: retention RPC boundary is incorrect';
  END IF;
  IF has_function_privilege('anon',
       'public.list_expired_unattached_instructor_uploads(integer)', 'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.list_expired_unattached_instructor_uploads(integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role',
       'public.list_expired_unattached_instructor_uploads(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'PRIVILEGE FAILED: abandoned-upload cleanup RPC boundary is incorrect';
  END IF;

  RESET ROLE;
  SET LOCAL ROLE service_role;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT object_path INTO v_orphan_path
    FROM public.list_expired_unattached_instructor_uploads(500);
  IF v_orphan_path IS DISTINCT FROM
       'applications/00000000-0000-0000-0000-000000000003/cccccccccccccccccccccccccccccccc.pdf' THEN
    RAISE EXCEPTION
      'ABANDONED UPLOAD CLEANUP FAILED: expected only the expired unattached object, got %',
      v_orphan_path;
  END IF;
  SELECT inquiries_redacted, newsletters_redacted
    INTO v_inquiries_redacted, v_newsletters_redacted
  FROM public.finalize_public_retention(ARRAY[v_expired_application_inquiry]);
  IF v_inquiries_redacted <> 2 OR v_newsletters_redacted <> 1 THEN
    RAISE EXCEPTION 'RETENTION FAILED: expected 2 inquiry and 1 newsletter redactions, got % and %',
      v_inquiries_redacted, v_newsletters_redacted;
  END IF;

  RESET ROLE;
  IF EXISTS (
    SELECT 1 FROM public.public_inquiries
    WHERE id IN (v_expired_contact, v_expired_application_inquiry)
      AND (full_name <> '[redacted]'
        OR email NOT LIKE 'redacted+%@invalid.invalid'
        OR phone IS NOT NULL
        OR message <> '[redacted after retention]'
        OR details <> '{}'::jsonb
        OR user_agent_family IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'RETENTION FAILED: expired inquiry PII survived';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.instructor_application_details
    WHERE id = v_expired_application
      AND (subjects <> ARRAY['[redacted]']::text[]
        OR qualifications_summary <> '[redacted after retention]'
        OR document_paths <> '{}'::text[]
        OR decided_by IS NOT NULL
        OR decision_note IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'RETENTION FAILED: expired applicant PII survived';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.newsletter_subscriptions
    WHERE id = v_newsletter
      AND (email_normalized <> 'redacted+' || v_newsletter::text || '@invalid.invalid'
        OR confirmation_token_hash IS NOT NULL
        OR state <> 'suppressed')
  ) THEN
    RAISE EXCEPTION 'RETENTION FAILED: expired newsletter PII survived';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.newsletter_consent_events
    WHERE subscription_id = v_newsletter
      AND (actor_id IS NOT NULL OR evidence <> '{}'::jsonb)
  ) THEN
    RAISE EXCEPTION 'RETENTION FAILED: expired consent evidence survived';
  END IF;
END
$stage3$;

ROLLBACK;
