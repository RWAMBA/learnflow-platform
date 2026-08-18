-- Phase 10 Stage 1 — live-principal STORAGE authorization proof.
--
-- DISPOSABLE ENVIRONMENTS ONLY. Writes rows, impersonates real database
-- principals (SET LOCAL ROLE anon / authenticated + request.jwt.claims) and
-- ALWAYS ends in ROLLBACK. The runner refuses any non-disposable connection.
--
-- Scope: the actual Stage 1 storage surface found in the repository.
--   * exactly one bucket: 'curriculum-resources' (private)
--   * policies: curriculum_resources_read / _insert / _update / _delete on
--     storage.objects, keyed on ((storage.foldername(name))[1])::uuid
--   * rights / licence evidence (source_artifacts.original_artifact_path,
--     rights_grants.evidence_storage_path) has NO bucket in Stage 1; these
--     assertions prove that no tenant principal can reach a platform-private
--     object namespace and that the evidence rows themselves are
--     Platform-Administrator-only.

BEGIN;

SET LOCAL client_min_messages = warning;

DO $outer$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  -- A namespace that belongs to no organization: the stand-in for
  -- platform-private licence/rights evidence.
  v_platform_ns uuid := gen_random_uuid();
  v_admin_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
  v_teacher_a uuid := gen_random_uuid();
  v_tutor_a uuid := gen_random_uuid();
  v_student_a uuid := gen_random_uuid();
  v_parent_a uuid := gen_random_uuid();
  v_platform uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_obj_a uuid := gen_random_uuid();
  v_obj_b uuid := gen_random_uuid();
  v_obj_platform uuid := gen_random_uuid();
  v_role_admin uuid;
  v_role_teacher uuid;
  v_role_tutor uuid;
  v_role_student uuid;
  v_role_parent uuid;
  v_curriculum uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
  v_artifact uuid;
  v_grant uuid;
  v_learner uuid;
  v_visible int;
  v_rows int;
  v_principal uuid;
  v_label text;
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE EXCEPTION 'storage schema is not present in this disposable database';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname IN ('curriculum_resources_read', 'curriculum_resources_insert',
                          'curriculum_resources_update', 'curriculum_resources_delete')
     HAVING count(*) = 4
  ) THEN
    RAISE EXCEPTION 'Stage 1 storage policies are missing from this disposable database';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass) THEN
    RAISE EXCEPTION 'RLS is not enabled on storage.objects';
  END IF;

  -- ------------------------------------------------------------- fixtures
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_a,   'storage-admin-a@example.test'),
    (v_admin_b,   'storage-admin-b@example.test'),
    (v_teacher_a, 'storage-teacher-a@example.test'),
    (v_tutor_a,   'storage-tutor-a@example.test'),
    (v_student_a, 'storage-student-a@example.test'),
    (v_parent_a,  'storage-parent-a@example.test'),
    (v_platform,  'storage-platform@example.test'),
    (v_outsider,  'storage-outsider@example.test')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name) VALUES
    (v_admin_a, 'Admin A'), (v_admin_b, 'Admin B'), (v_teacher_a, 'Teacher A'),
    (v_tutor_a, 'Tutor A'), (v_student_a, 'Student A'), (v_parent_a, 'Parent A'),
    (v_platform, 'Platform Admin'), (v_outsider, 'Outsider')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name, tenant_type)
  VALUES (v_org_a, 'Disposable Org A', 'family'), (v_org_b, 'Disposable Org B', 'family');

  INSERT INTO public.organization_memberships (organization_id, user_id, status, created_by) VALUES
    (v_org_a, v_admin_a,   'active', v_admin_a),
    (v_org_a, v_teacher_a, 'active', v_admin_a),
    (v_org_a, v_tutor_a,   'active', v_admin_a),
    (v_org_a, v_student_a, 'active', v_admin_a),
    (v_org_a, v_parent_a,  'active', v_admin_a),
    (v_org_b, v_admin_b,   'active', v_admin_b);

  SELECT id INTO v_role_admin   FROM public.roles WHERE code = 'org_admin';
  SELECT id INTO v_role_teacher FROM public.roles WHERE code = 'teacher';
  SELECT id INTO v_role_tutor   FROM public.roles WHERE code = 'tutor';
  SELECT id INTO v_role_student FROM public.roles WHERE code = 'student';
  SELECT id INTO v_role_parent  FROM public.roles WHERE code = 'parent_guardian';
  IF v_role_admin IS NULL OR v_role_teacher IS NULL OR v_role_tutor IS NULL
     OR v_role_student IS NULL OR v_role_parent IS NULL THEN
    RAISE EXCEPTION 'role catalogue incomplete in disposable database';
  END IF;

  INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by) VALUES
    (v_org_a, v_admin_a,   v_role_admin,   'active', v_admin_a),
    (v_org_a, v_teacher_a, v_role_teacher, 'active', v_admin_a),
    (v_org_a, v_tutor_a,   v_role_tutor,   'active', v_admin_a),
    (v_org_a, v_student_a, v_role_student, 'active', v_admin_a),
    (v_org_a, v_parent_a,  v_role_parent,  'active', v_admin_a),
    (v_org_b, v_admin_b,   v_role_admin,   'active', v_admin_b);

  INSERT INTO public.platform_admins (user_id, status) VALUES (v_platform, 'active');

  -- The bucket row is created by the Supabase Storage tool in the hosted
  -- project, so the disposable database needs it created here.
  INSERT INTO storage.buckets (id, name, public)
  VALUES ('curriculum-resources', 'curriculum-resources', false)
  ON CONFLICT (id) DO NOTHING;

  IF (SELECT public FROM storage.buckets WHERE id = 'curriculum-resources') THEN
    RAISE EXCEPTION 'DENY FAILED: curriculum-resources must be a private bucket';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE public) THEN
    RAISE EXCEPTION 'DENY FAILED: a public storage bucket exists in Stage 1';
  END IF;

  -- Seed one object per namespace as the trusted owner.
  INSERT INTO storage.objects (id, bucket_id, name, owner) VALUES
    (v_obj_a,        'curriculum-resources', v_org_a::text || '/lesson/plan-a.pdf',        v_admin_a),
    (v_obj_b,        'curriculum-resources', v_org_b::text || '/lesson/plan-b.pdf',        v_admin_b),
    (v_obj_platform, 'curriculum-resources', v_platform_ns::text || '/licence/cbc-mou.pdf', v_platform);

  INSERT INTO public.curricula (id, code, name) VALUES (v_curriculum, 'DISPS', 'Disposable Storage');
  INSERT INTO public.curriculum_versions (id, curriculum_id, label)
  VALUES (v_version, v_curriculum, 'v1');

  INSERT INTO public.source_artifacts (rights_holder, source_title, original_artifact_path)
  VALUES ('Disposable Rights Holder', 'Disposable Source',
          v_platform_ns::text || '/licence/cbc-mou.pdf')
  RETURNING id INTO v_artifact;

  -- An EXPIRED grant: restricted evidence that must stay unreadable and must
  -- never satisfy the availability gate.
  INSERT INTO public.rights_grants
    (source_artifact_id, grant_type, evidence_storage_path, effective_date, expiry_date,
     reviewer_id, reviewed_at, permits_commercial_use, permits_storage, permits_authenticated_display)
  VALUES (v_artifact, 'licence', v_platform_ns::text || '/licence/cbc-mou.pdf',
          current_date - 800, current_date - 1, v_platform, now(), true, true, true)
  RETURNING id INTO v_grant;

  INSERT INTO public.students (organization_id, created_by, first_name, last_name)
  VALUES (v_org_a, v_admin_a, 'Storage', 'Learner') RETURNING id INTO v_learner;

  -- =====================================================================
  -- 1. ANONYMOUS: no list, no read, no write anywhere.
  -- =====================================================================
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  BEGIN
    SELECT count(*) INTO v_visible FROM storage.objects;
  EXCEPTION WHEN insufficient_privilege THEN
    -- No table privilege at all is a stricter denial than an empty result.
    v_visible := 0;
  END;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: anonymous principal can list % storage object(s)', v_visible;
  END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('curriculum-resources', v_org_a::text || '/anon.pdf');
    RAISE EXCEPTION 'DENY FAILED: anonymous principal wrote a storage object';
  EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN NULL;
  END;
  UPDATE storage.objects SET name = name || '.x' WHERE id = v_obj_a;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: anonymous principal updated a storage object';
  END IF;
  DELETE FROM storage.objects WHERE id = v_obj_a;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: anonymous principal deleted a storage object';
  END IF;

  SET LOCAL ROLE authenticated;

  -- =====================================================================
  -- 2. NON-AUTHORING TENANT PRINCIPALS (student, parent, teacher, tutor)
  --    * denied every write on tenant objects
  --    * denied all access to the platform-private evidence namespace
  --      (this is the "private rights/licence evidence" denial)
  --    * denied all access to the other tenant's namespace
  -- =====================================================================
  FOREACH v_label IN ARRAY ARRAY['student', 'parent', 'teacher', 'tutor'] LOOP
    v_principal := CASE v_label
      WHEN 'student' THEN v_student_a WHEN 'parent' THEN v_parent_a
      WHEN 'teacher' THEN v_teacher_a ELSE v_tutor_a END;
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', v_principal, 'role', 'authenticated')::text, true);

    -- private rights/licence evidence: invisible
    SELECT count(*) INTO v_visible FROM storage.objects WHERE id = v_obj_platform;
    IF v_visible <> 0 THEN
      RAISE EXCEPTION 'DENY FAILED: % can read platform-private licence evidence', v_label;
    END IF;
    -- other tenant: invisible
    SELECT count(*) INTO v_visible FROM storage.objects WHERE id = v_obj_b;
    IF v_visible <> 0 THEN
      RAISE EXCEPTION 'DENY FAILED: % can read a cross-tenant storage object', v_label;
    END IF;
    -- no authoring authority anywhere, including their own tenant
    BEGIN
      INSERT INTO storage.objects (bucket_id, name)
      VALUES ('curriculum-resources', v_org_a::text || '/' || v_label || '-upload.pdf');
      RAISE EXCEPTION 'DENY FAILED: % uploaded a learning resource without authoring authority', v_label;
    EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN NULL;
    END;
    UPDATE storage.objects SET metadata = '{"tampered":true}'::jsonb WHERE id = v_obj_a;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'DENY FAILED: % updated a learning resource object', v_label;
    END IF;
    DELETE FROM storage.objects WHERE id = v_obj_a;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 0 THEN
      RAISE EXCEPTION 'DENY FAILED: % deleted a learning resource object', v_label;
    END IF;

    -- rights provenance rows are Platform-Administrator-only, so the evidence
    -- path itself is never disclosed to a tenant principal.
    SELECT count(*) INTO v_visible FROM public.rights_grants WHERE id = v_grant;
    IF v_visible <> 0 THEN
      RAISE EXCEPTION 'DENY FAILED: % can read a rights grant', v_label;
    END IF;
    SELECT count(*) INTO v_visible FROM public.source_artifacts WHERE id = v_artifact;
    IF v_visible <> 0 THEN
      RAISE EXCEPTION 'DENY FAILED: % can read a source artifact', v_label;
    END IF;
  END LOOP;

  -- =====================================================================
  -- 3. ORGANIZATION ADMINISTRATOR: authoring inside its own tenant only.
  -- =====================================================================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_visible FROM storage.objects WHERE id = v_obj_a;
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: tenant admin cannot read its own learning resource';
  END IF;

  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('curriculum-resources', v_org_a::text || '/lesson/new-plan.pdf');

  UPDATE storage.objects SET metadata = '{"ok":true}'::jsonb WHERE id = v_obj_a;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: tenant admin cannot update its own learning resource';
  END IF;

  -- platform-private licence evidence stays out of reach of tenant admins
  SELECT count(*) INTO v_visible FROM storage.objects WHERE id = v_obj_platform;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: organization admin can read platform-private licence evidence';
  END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('curriculum-resources', v_platform_ns::text || '/licence/forged.pdf');
    RAISE EXCEPTION 'DENY FAILED: organization admin wrote into the platform-private namespace';
  EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN NULL;
  END;
  SELECT count(*) INTO v_visible FROM public.rights_grants WHERE id = v_grant;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: organization admin can read platform licence evidence metadata';
  END IF;

  -- =====================================================================
  -- 4. CROSS-TENANT: list / read / write / update / delete all denied.
  -- =====================================================================
  SELECT count(*) INTO v_visible FROM storage.objects WHERE id = v_obj_b;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: tenant admin can read a cross-tenant object';
  END IF;
  SELECT count(*) INTO v_visible FROM storage.objects
   WHERE name LIKE v_org_b::text || '%';
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: tenant admin can list a cross-tenant prefix';
  END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('curriculum-resources', v_org_b::text || '/lesson/injected.pdf');
    RAISE EXCEPTION 'DENY FAILED: tenant admin wrote into another tenant prefix';
  EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN NULL;
  END;
  UPDATE storage.objects SET metadata = '{"tampered":true}'::jsonb WHERE id = v_obj_b;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: tenant admin updated a cross-tenant object';
  END IF;
  DELETE FROM storage.objects WHERE id = v_obj_b;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: tenant admin deleted a cross-tenant object';
  END IF;

  -- =====================================================================
  -- 5. OBJECT-PATH MANIPULATION cannot cross a tenant or source boundary.
  --    The policy keys on the FIRST path segment, so traversal-style and
  --    non-uuid prefixes must all fail closed.
  -- =====================================================================
  FOREACH v_label IN ARRAY ARRAY[
    '../',                       -- traversal prefix
    '.',                         -- dot prefix
    'curriculum-resources',      -- bucket-name prefix
    'public'                     -- pseudo-public prefix
  ] LOOP
    BEGIN
      INSERT INTO storage.objects (bucket_id, name)
      VALUES ('curriculum-resources', v_label || '/' || v_org_b::text || '/escape.pdf');
      RAISE EXCEPTION 'DENY FAILED: path manipulation with prefix "%" was accepted', v_label;
    EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN NULL;
    END;
  END LOOP;
  -- own-tenant prefix followed by traversal segments still resolves to the
  -- owning tenant and must not reach another tenant's objects
  SELECT count(*) INTO v_visible FROM storage.objects
   WHERE name = v_org_a::text || '/../' || v_org_b::text || '/plan-b.pdf';
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: traversal path resolved to a cross-tenant object';
  END IF;

  -- =====================================================================
  -- 6. PLATFORM ADMINISTRATOR: platform authority is NOT tenant storage
  --    authority. Stage 1 has no platform object namespace in this bucket,
  --    so a platform admin without membership is denied here, while the
  --    licence-evidence METADATA it owns remains readable to it alone.
  -- =====================================================================
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_platform, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_visible FROM storage.objects;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: platform admin without membership can list tenant objects';
  END IF;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('curriculum-resources', v_org_a::text || '/platform-injected.pdf');
    RAISE EXCEPTION 'DENY FAILED: platform admin wrote into a tenant namespace';
  EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN NULL;
  END;
  SELECT count(*) INTO v_visible FROM public.rights_grants WHERE id = v_grant;
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: platform admin cannot read the licence evidence record';
  END IF;

  -- =====================================================================
  -- 7. EXPIRED / RESTRICTED EVIDENCE never unlocks curriculum availability,
  --    so learning-resource access stays gated by availability + ownership.
  -- =====================================================================
  INSERT INTO public.source_artifact_links (source_artifact_id, entity_type, entity_id)
  VALUES (v_artifact, 'curriculum_version', v_version);
  IF public.curriculum_version_is_available(v_version) THEN
    RAISE EXCEPTION 'DENY FAILED: an expired rights grant satisfied the availability gate';
  END IF;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_student_a, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.curriculum_nodes
   WHERE curriculum_version_id = v_version;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: learner can browse nodes of an unavailable curriculum version';
  END IF;
  SELECT count(*) INTO v_visible FROM public.lessons WHERE status <> 'published';
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: learner can browse unpublished lessons';
  END IF;
  SELECT count(*) INTO v_visible FROM public.curriculum_resources
   WHERE organization_id = v_org_b;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: learner can read cross-tenant curriculum resources';
  END IF;

  RESET ROLE;
  RAISE NOTICE '[stage1-storage] all storage allow/deny assertions passed';
END
$outer$;

ROLLBACK;
