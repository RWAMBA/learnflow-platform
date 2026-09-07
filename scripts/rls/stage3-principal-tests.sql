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
  v_count integer;
  v_rows integer;
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
END
$stage3$;

ROLLBACK;
