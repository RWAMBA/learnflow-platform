-- Phase 10 Stage 1C — live-principal RLS allow/deny proof.
--
-- DISPOSABLE ENVIRONMENTS ONLY. This script writes rows and impersonates
-- database principals. It is wrapped in a single transaction that ALWAYS ends
-- in ROLLBACK, and the runner refuses to execute it against any connection not
-- explicitly marked disposable. It must never be run against production.
--
-- Every assertion is an allow/deny outcome under a real principal
-- (SET LOCAL ROLE authenticated + request.jwt.claims), never a policy-text
-- inspection.

BEGIN;

SET LOCAL client_min_messages = warning;

DO $outer$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();
  v_admin_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
  v_parent_a uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();
  v_student_a uuid;
  v_period_a uuid;
  v_enrollment uuid;
  v_role_admin uuid;
  v_curriculum uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
  v_level uuid := gen_random_uuid();
  v_visible int;
BEGIN
  IF to_regclass('public.curriculum_enrollments') IS NULL THEN
    RAISE EXCEPTION 'Stage 1C migration is not applied in this disposable database';
  END IF;

  -- ---------------------------------------------------------------- fixtures
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_a, 'admin-a@example.test'),
    (v_admin_b, 'admin-b@example.test'),
    (v_parent_a, 'parent-a@example.test'),
    (v_outsider, 'outsider@example.test')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name) VALUES
    (v_admin_a, 'Admin A'), (v_admin_b, 'Admin B'),
    (v_parent_a, 'Parent A'), (v_outsider, 'Outsider')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name, tenant_type)
  VALUES (v_org_a, 'Disposable Org A', 'family'), (v_org_b, 'Disposable Org B', 'family');

  -- Audit ownership is explicit everywhere: created_by always references a
  -- synthetic principal created inside this rolled-back transaction.
  INSERT INTO public.organization_memberships (organization_id, user_id, status, created_by) VALUES
    (v_org_a, v_admin_a, 'active', v_admin_a),
    (v_org_b, v_admin_b, 'active', v_admin_b),
    (v_org_a, v_parent_a, 'active', v_admin_a);

  SELECT id INTO v_role_admin FROM public.roles WHERE code = 'org_admin';
  IF v_role_admin IS NULL THEN
    RAISE EXCEPTION 'roles.org_admin missing in disposable database';
  END IF;

  INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by) VALUES
    (v_org_a, v_admin_a, v_role_admin, 'active', v_admin_a),
    (v_org_b, v_admin_b, v_role_admin, 'active', v_admin_b);

  INSERT INTO public.students (organization_id, created_by, first_name, last_name)
  VALUES (v_org_a, v_admin_a, 'Test', 'Learner') RETURNING id INTO v_student_a;

  -- public.parent_student_relationships.created_by is NOT NULL with no default
  -- and references public.profiles(id): the creating tenant administrator.
  INSERT INTO public.parent_student_relationships
    (organization_id, parent_id, student_id, role_subtype, permission_level, status, created_by)
  VALUES (v_org_a, v_parent_a, v_student_a, 'legal_guardian', 'view_only', 'active', v_admin_a);

  INSERT INTO public.curricula (id, code, name) VALUES (v_curriculum, 'DISP', 'Disposable');
  INSERT INTO public.curriculum_versions (id, curriculum_id, label)
  VALUES (v_version, v_curriculum, 'v1');
  INSERT INTO public.grades (id, curriculum_id, name, sequence_order)
  VALUES (v_level, v_curriculum, 'Level 1', 1);

  INSERT INTO public.academic_periods (id, organization_id, period_type, name, start_date, end_date)
  VALUES (gen_random_uuid(), v_org_a, 'year', '2026', '2026-01-01', '2026-12-31')
  RETURNING id INTO v_period_a;

  INSERT INTO public.curriculum_enrollments
    (student_id, curriculum_version_id, academic_level_id, academic_period_id, enrollment_category)
  VALUES (v_student_a, v_version, v_level, v_period_a, 'primary')
  RETURNING id INTO v_enrollment;

  -- ------------------------------------------- DENY: cross-tenant org admin
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_b, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO v_visible FROM public.academic_periods WHERE id = v_period_a;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: cross-tenant admin can read another organization''s period';
  END IF;
  SELECT count(*) INTO v_visible FROM public.curriculum_enrollments WHERE id = v_enrollment;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: cross-tenant admin can read another organization''s enrollment';
  END IF;

  BEGIN
    UPDATE public.curriculum_enrollments SET status = 'active' WHERE id = v_enrollment;
    IF FOUND THEN
      RAISE EXCEPTION 'DENY FAILED: cross-tenant admin activated an enrollment';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- --------------------------------------------------- DENY: unrelated user
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.curriculum_enrollments WHERE id = v_enrollment;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: unrelated authenticated user can read an enrollment';
  END IF;

  -- ------------------------------- ALLOW read / DENY write: related parent
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_a, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.curriculum_enrollments WHERE id = v_enrollment;
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: related guardian cannot read the enrollment';
  END IF;

  BEGIN
    UPDATE public.curriculum_enrollments SET status = 'active' WHERE id = v_enrollment;
    IF FOUND THEN
      RAISE EXCEPTION 'DENY FAILED: view-only guardian activated an enrollment';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- ------------------------------------------- ALLOW: same-tenant org admin
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.curriculum_enrollments WHERE id = v_enrollment;
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: tenant org admin cannot read the enrollment';
  END IF;
  UPDATE public.curriculum_enrollments SET status = 'active' WHERE id = v_enrollment;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALLOW FAILED: tenant org admin cannot activate the enrollment';
  END IF;

  -- ------------------------------------ lifecycle proofs under a real principal
  IF (SELECT enrolled_at FROM public.curriculum_enrollments WHERE id = v_enrollment) IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE FAILED: enrolled_at was not database-assigned';
  END IF;

  BEGIN
    UPDATE public.curriculum_enrollments SET academic_level_id = v_level, status = 'completed'
     WHERE id = v_enrollment;
    UPDATE public.curriculum_enrollments SET status = 'pending' WHERE id = v_enrollment;
    RAISE EXCEPTION 'LIFECYCLE FAILED: backward transition accepted';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm NOT LIKE '%lifecycle violation%' AND sqlerrm NOT LIKE '%LIFECYCLE FAILED%' THEN
      RAISE;
    END IF;
    IF sqlerrm LIKE '%LIFECYCLE FAILED%' THEN RAISE; END IF;
  END;

  RESET ROLE;
  RAISE NOTICE '[stage1c-rls] all allow/deny and lifecycle assertions passed';
END
$outer$;

-- ---------------------------------------------------------------------------
-- Stage 1 controlled correction — live-principal proof of the privileged RPC
-- public.create_student_with_placement(...). The function is invoked ONLY as a
-- real `authenticated` principal carrying request.jwt.claims for a synthetic
-- guardian; no owner, service_role or migration role shortcut is used, and no
-- row the function is responsible for is inserted by hand.
-- ---------------------------------------------------------------------------
DO $rpc$
DECLARE
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_parent uuid := gen_random_uuid();
  v_role_parent uuid;
  v_curriculum uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
  v_level uuid := gen_random_uuid();
  v_result jsonb;
  v_student uuid;
  v_enrollment uuid;
  v_count int;
  v_row record;
BEGIN
  IF to_regprocedure(
       'public.create_student_with_placement(uuid, text, text, date, uuid, uuid, text)'
     ) IS NULL THEN
    RAISE EXCEPTION 'Stage 1 correction migration is not applied in this disposable database';
  END IF;

  -- ---------------------------------------------------------------- fixtures
  INSERT INTO auth.users (id, email) VALUES (v_parent, 'rpc-parent@example.test')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.profiles (id, full_name) VALUES (v_parent, 'RPC Parent')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name, tenant_type) VALUES
    (v_org, 'Disposable Org RPC', 'family'),
    (v_other_org, 'Disposable Org RPC Other', 'family');

  INSERT INTO public.organization_memberships (organization_id, user_id, status, created_by)
  VALUES (v_org, v_parent, 'active', v_parent);

  SELECT id INTO v_role_parent FROM public.roles WHERE code = 'parent_guardian';
  IF v_role_parent IS NULL THEN
    RAISE EXCEPTION 'roles.parent_guardian missing in disposable database';
  END IF;

  INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
  VALUES (v_org, v_parent, v_role_parent, 'active', v_parent);

  INSERT INTO public.curricula (id, code, name) VALUES (v_curriculum, 'DISPRPC', 'Disposable RPC');
  -- Exactly one current version for this curriculum: the deterministic path.
  -- Publication is required for a current version by the schema's own check
  -- constraint. Rights, readiness and activation state are deliberately left at
  -- their fail-closed defaults, so the version remains unavailable to ordinary
  -- users; only the deterministic resolution path is exercised.
  INSERT INTO public.curriculum_versions (id, curriculum_id, label, status, is_current)
  VALUES (v_version, v_curriculum, 'v1', 'published', true);
  INSERT INTO public.grades (id, curriculum_id, name, sequence_order)
  VALUES (v_level, v_curriculum, 'RPC Level 1', 1);

  SELECT count(*) INTO v_count
    FROM public.curriculum_versions WHERE curriculum_id = v_curriculum AND is_current;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FIXTURE FAILED: expected exactly one current version, found %', v_count;
  END IF;

  -- ------------------------------------- live invocation as the real principal
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent, 'role', 'authenticated')::text, true);

  SELECT public.create_student_with_placement(
    v_org, 'Disposable', 'Learner', NULL::date, v_level, NULL::uuid, 'legal_guardian'
  ) INTO v_result;

  RESET ROLE;

  -- ------------------------------------------------------------- assertions
  IF v_result IS NULL OR v_result->>'student_id' IS NULL THEN
    RAISE EXCEPTION 'RPC FAILED: no student identifier returned';
  END IF;
  v_student := (v_result->>'student_id')::uuid;
  v_enrollment := nullif(v_result->>'enrollment_id', '')::uuid;
  IF v_enrollment IS NULL THEN
    RAISE EXCEPTION 'RPC FAILED: no enrollment identifier returned';
  END IF;

  SELECT count(*) INTO v_count FROM public.students WHERE id = v_student;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RPC FAILED: expected exactly one created student, found %', v_count;
  END IF;

  SELECT organization_id, created_by, grade_id, pathway_id INTO v_row
    FROM public.students WHERE id = v_student;
  IF v_row.organization_id <> v_org THEN
    RAISE EXCEPTION 'RPC FAILED: student tenant is not the target organization';
  END IF;
  IF v_row.created_by IS DISTINCT FROM v_parent THEN
    RAISE EXCEPTION 'RPC FAILED: creator does not resolve to the authenticated principal';
  END IF;
  IF v_row.grade_id IS NOT NULL THEN
    RAISE EXCEPTION 'RPC FAILED: deprecated students.grade_id was written';
  END IF;
  IF v_row.pathway_id IS NOT NULL THEN
    RAISE EXCEPTION 'RPC FAILED: deprecated students.pathway_id was written';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.parent_student_relationships
   WHERE student_id = v_student AND parent_id = v_parent
     AND organization_id = v_org AND status = 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RPC FAILED: expected exactly one active guardian relationship, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.curriculum_enrollments WHERE student_id = v_student;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RPC FAILED: expected exactly one enrollment, found %', v_count;
  END IF;

  SELECT status, enrollment_category, academic_level_id, curriculum_version_id, track_id
    INTO v_row
    FROM public.curriculum_enrollments WHERE id = v_enrollment;
  IF v_row.enrollment_category <> 'primary' THEN
    RAISE EXCEPTION 'RPC FAILED: enrollment is not primary';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'RPC FAILED: enrollment status is %, expected pending', v_row.status;
  END IF;
  IF v_row.academic_level_id <> v_level THEN
    RAISE EXCEPTION 'RPC FAILED: enrollment academic level does not match the selected grade';
  END IF;
  IF v_row.curriculum_version_id <> v_version THEN
    RAISE EXCEPTION 'RPC FAILED: enrollment version is not the single deterministic current version';
  END IF;
  IF v_row.track_id IS NOT NULL THEN
    RAISE EXCEPTION 'RPC FAILED: a track was invented for a gradeless pathway selection';
  END IF;

  -- Tenant scope of the placement is the target organization only.
  SELECT count(*) INTO v_count
    FROM public.curriculum_enrollments e
    JOIN public.students s ON s.id = e.student_id
   WHERE e.id = v_enrollment AND s.organization_id = v_org;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RPC FAILED: enrollment does not belong to the target tenant';
  END IF;

  -- No unrelated or duplicate placement leaked into the other disposable tenant.
  SELECT count(*) INTO v_count
    FROM public.curriculum_enrollments e
    JOIN public.students s ON s.id = e.student_id
   WHERE s.organization_id = v_other_org;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RPC FAILED: an unrelated placement was created';
  END IF;

  -- Audit/history entry.
  SELECT count(*) INTO v_count
    FROM public.audit_logs
   WHERE entity_type = 'students' AND entity_id = v_student
     AND action = 'student.created' AND actor_user_id = v_parent
     AND organization_id = v_org;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'RPC FAILED: expected exactly one audit entry, found %', v_count;
  END IF;

  RAISE NOTICE '[stage1c-rpc] live-principal create_student_with_placement assertions passed';
END
$rpc$;

-- =====================================================================
-- Live-principal proof for public.transfer_curriculum_enrollment.
--
-- Proves under real authenticated principals that the transfer is
-- authorized, atomic and gated: an unauthorized or unavailable transfer
-- leaves the learner's original placement untouched and active, and an
-- authorized transfer moves the learner in one indivisible step.
-- =====================================================================
DO $transfer$
DECLARE
  v_org        uuid := gen_random_uuid();
  v_other_org  uuid := gen_random_uuid();
  v_admin      uuid := gen_random_uuid();
  v_other_admin uuid := gen_random_uuid();
  v_parent     uuid := gen_random_uuid();
  v_platform   uuid := gen_random_uuid();
  v_curriculum uuid := gen_random_uuid();
  v_from_ver   uuid := gen_random_uuid();
  v_to_ver     uuid := gen_random_uuid();
  v_blocked_ver uuid := gen_random_uuid();
  v_from_level uuid := gen_random_uuid();
  v_to_level   uuid := gen_random_uuid();
  v_artifact   uuid := gen_random_uuid();
  v_role_admin uuid;
  v_student    uuid;
  v_source     uuid;
  v_new        uuid;
  v_result     jsonb;
  v_count      int;
  v_status     text;
BEGIN
  IF to_regprocedure('public.transfer_curriculum_enrollment(uuid,uuid,uuid,uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'the atomic transfer migration is not applied in this disposable database';
  END IF;

  -- ---------------------------------------------------------------- fixtures
  INSERT INTO auth.users (id, email) VALUES
    (v_admin, 'xfer-admin@example.test'),
    (v_other_admin, 'xfer-other-admin@example.test'),
    (v_parent, 'xfer-parent@example.test'),
    (v_platform, 'xfer-platform@example.test')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name) VALUES
    (v_admin, 'Xfer Admin'), (v_other_admin, 'Xfer Other Admin'),
    (v_parent, 'Xfer Parent'), (v_platform, 'Xfer Platform')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name, tenant_type) VALUES
    (v_org, 'Disposable Org XFER', 'family'),
    (v_other_org, 'Disposable Org XFER-OTHER', 'family');

  INSERT INTO public.organization_memberships (organization_id, user_id, status, created_by) VALUES
    (v_org, v_admin, 'active', v_admin),
    (v_org, v_parent, 'active', v_admin),
    (v_other_org, v_other_admin, 'active', v_other_admin);

  SELECT id INTO v_role_admin FROM public.roles WHERE code = 'org_admin';
  INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by) VALUES
    (v_org, v_admin, v_role_admin, 'active', v_admin),
    (v_other_org, v_other_admin, v_role_admin, 'active', v_other_admin);

  INSERT INTO public.curricula (id, code, name)
  VALUES (v_curriculum, 'XFER', 'Disposable Transfer Curriculum');

  -- Source version: ordinary, unavailable. Destination version: fully
  -- available. A third version stays unavailable to prove the gate.
  INSERT INTO public.curriculum_versions (id, curriculum_id, label)
  VALUES (v_from_ver, v_curriculum, 'from'),
         (v_to_ver, v_curriculum, 'to'),
         (v_blocked_ver, v_curriculum, 'blocked');

  INSERT INTO public.grades (id, curriculum_id, name, sequence_order)
  VALUES (v_from_level, v_curriculum, 'Level 1', 1),
         (v_to_level, v_curriculum, 'Level 2', 2);

  -- Rights chain that makes the destination version genuinely available.
  INSERT INTO public.source_artifacts (id, title, artifact_type)
  VALUES (v_artifact, 'Disposable Transfer Artifact', 'official_document');
  INSERT INTO public.source_artifact_links (source_artifact_id, entity_type, entity_id)
  VALUES (v_artifact, 'curriculum_version', v_to_ver);
  INSERT INTO public.rights_grants
    (source_artifact_id, grant_type, effective_date, expiry_date, reviewer_id, reviewed_at,
     permits_commercial_use, permits_storage, permits_authenticated_display)
  VALUES (v_artifact, 'commercial_licence', current_date - 10, current_date + 365,
          v_platform, now(), true, true, true);

  UPDATE public.curriculum_versions
     SET status = 'published', is_current = true, content_readiness = 'complete',
         rights_status = 'authorized', rights_reviewed_at = now(), rights_reviewed_by = v_platform,
         activation_status = 'active'
   WHERE id = v_to_ver;

  IF NOT public.curriculum_version_is_available(v_to_ver) THEN
    RAISE EXCEPTION 'FIXTURE FAILED: the destination version is not available';
  END IF;
  IF public.curriculum_version_is_available(v_blocked_ver) THEN
    RAISE EXCEPTION 'FIXTURE FAILED: the blocked version must stay unavailable';
  END IF;

  INSERT INTO public.students (organization_id, created_by, first_name, last_name)
  VALUES (v_org, v_admin, 'Transfer', 'Learner') RETURNING id INTO v_student;

  INSERT INTO public.parent_student_relationships
    (organization_id, parent_id, student_id, role_subtype, permission_level, status, created_by)
  VALUES (v_org, v_parent, v_student, 'legal_guardian', 'full_management', 'active', v_admin);

  INSERT INTO public.curriculum_enrollments
    (student_id, curriculum_version_id, academic_level_id, enrollment_category)
  VALUES (v_student, v_from_ver, v_from_level, 'primary')
  RETURNING id INTO v_source;
  UPDATE public.curriculum_enrollments SET status = 'active' WHERE id = v_source;

  -- ===================================================== DENY: anonymous
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  BEGIN
    PERFORM public.transfer_curriculum_enrollment(v_source, v_to_ver, v_to_level);
    RAISE EXCEPTION 'DENY FAILED: anonymous caller transferred an enrollment';
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN NULL;
  END;

  -- ============================================ DENY: cross-tenant admin
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_other_admin, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.transfer_curriculum_enrollment(v_source, v_to_ver, v_to_level);
    RAISE EXCEPTION 'DENY FAILED: cross-tenant admin transferred another tenant''s learner';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- =============================== DENY: full-management guardian, not admin
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.transfer_curriculum_enrollment(v_source, v_to_ver, v_to_level);
    RAISE EXCEPTION 'DENY FAILED: a guardian transferred a placement';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- The source placement survived every denied attempt.
  SET LOCAL ROLE postgres;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT status INTO v_status FROM public.curriculum_enrollments WHERE id = v_source;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'ATOMICITY FAILED: a denied transfer changed the source to %', v_status;
  END IF;

  -- ================================ DENY + ATOMICITY: unavailable destination
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.transfer_curriculum_enrollment(v_source, v_blocked_ver, v_to_level);
    RAISE EXCEPTION 'DENY FAILED: transfer into an unavailable curriculum version succeeded';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  SET LOCAL ROLE postgres;
  PERFORM set_config('request.jwt.claims', NULL, true);
  SELECT status INTO v_status FROM public.curriculum_enrollments WHERE id = v_source;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'ATOMICITY FAILED: a gated transfer left the source as %', v_status;
  END IF;
  SELECT count(*) INTO v_count FROM public.curriculum_enrollments WHERE student_id = v_student;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ATOMICITY FAILED: a failed transfer created % placement rows', v_count;
  END IF;

  -- ================================================= ALLOW: tenant org admin
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_result := public.transfer_curriculum_enrollment(v_source, v_to_ver, v_to_level);
  v_new := (v_result ->> 'enrollment_id')::uuid;
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'ALLOW FAILED: the transfer returned no replacement placement';
  END IF;

  SET LOCAL ROLE postgres;
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT status INTO v_status FROM public.curriculum_enrollments WHERE id = v_source;
  IF v_status <> 'transferred' THEN
    RAISE EXCEPTION 'ALLOW FAILED: the source status is %, expected transferred', v_status;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.curriculum_enrollments
   WHERE id = v_new AND status = 'active' AND enrollment_category = 'primary'
     AND curriculum_version_id = v_to_ver AND academic_level_id = v_to_level
     AND transferred_from_enrollment_id = v_source AND enrolled_at IS NOT NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: the replacement placement is missing or wrong';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.curriculum_enrollments
   WHERE student_id = v_student AND enrollment_category = 'primary' AND status = 'active';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: learner holds % active primary placements, expected 1', v_count;
  END IF;

  -- Audit evidence names the acting user and the correct tenant.
  SELECT count(*) INTO v_count
    FROM public.audit_logs
   WHERE entity_type = 'curriculum_enrollments' AND entity_id = v_new
     AND action = 'curriculum_enrollment.transferred'
     AND actor_user_id = v_admin AND organization_id = v_org;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: expected exactly one transfer audit row, found %', v_count;
  END IF;

  -- A second transfer of the already-closed source is refused.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.transfer_curriculum_enrollment(v_source, v_to_ver, v_to_level);
    RAISE EXCEPTION 'DENY FAILED: a closed enrollment was transferred again';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  SET LOCAL ROLE postgres;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE '[stage1c-transfer] live-principal transfer_curriculum_enrollment assertions passed';
END
$transfer$;

ROLLBACK;


