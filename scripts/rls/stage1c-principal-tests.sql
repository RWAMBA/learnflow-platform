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

ROLLBACK;
