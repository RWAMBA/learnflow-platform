-- Phase 10 Stage 2 — Programmes: live-principal RLS allow/deny proof.
--
-- DISPOSABLE ENVIRONMENTS ONLY. This script writes rows and impersonates
-- database principals. It is wrapped in a single transaction that ALWAYS ends
-- in ROLLBACK, and the runner refuses to execute it against any connection not
-- explicitly marked disposable. It must never be run against production.
--
-- Every assertion is an allow/deny outcome under a real principal
-- (SET LOCAL ROLE authenticated/anon + request.jwt.claims), never a
-- policy-text inspection.

BEGIN;

SET LOCAL client_min_messages = warning;

DO $stage2$
DECLARE
  v_org_a uuid := gen_random_uuid();
  v_org_b uuid := gen_random_uuid();

  v_admin_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
  v_parent_full uuid := gen_random_uuid();
  v_parent_view uuid := gen_random_uuid();
  v_teacher_linked uuid := gen_random_uuid();
  v_teacher_unlinked uuid := gen_random_uuid();
  v_outsider uuid := gen_random_uuid();

  v_role_admin uuid;
  v_role_parent uuid;
  v_role_teacher uuid;

  v_ur_teacher_linked uuid;
  v_ur_teacher_unlinked uuid;
  v_ur_teacher_b uuid;

  v_student_linked uuid;
  v_student_other uuid;

  v_prog uuid;
  v_prog_unlimited uuid;
  v_enrollment uuid;
  v_visible int;
  v_count int;
BEGIN
  IF to_regclass('public.programmes') IS NULL
     OR to_regprocedure('public.enroll_student_in_programme(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Stage 2 migration is not applied in this disposable database';
  END IF;

  -- ================================================================ fixtures
  INSERT INTO auth.users (id, email) VALUES
    (v_admin_a, 's2-admin-a@example.test'),
    (v_admin_b, 's2-admin-b@example.test'),
    (v_parent_full, 's2-parent-full@example.test'),
    (v_parent_view, 's2-parent-view@example.test'),
    (v_teacher_linked, 's2-teacher-linked@example.test'),
    (v_teacher_unlinked, 's2-teacher-unlinked@example.test'),
    (v_outsider, 's2-outsider@example.test')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles (id, full_name) VALUES
    (v_admin_a, 'S2 Admin A'), (v_admin_b, 'S2 Admin B'),
    (v_parent_full, 'S2 Parent Full'), (v_parent_view, 'S2 Parent View'),
    (v_teacher_linked, 'S2 Teacher Linked'), (v_teacher_unlinked, 'S2 Teacher Unlinked'),
    (v_outsider, 'S2 Outsider')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organizations (id, name, tenant_type) VALUES
    (v_org_a, 'Disposable Org S2A', 'private_school'),
    (v_org_b, 'Disposable Org S2B', 'private_school');

  INSERT INTO public.organization_memberships (organization_id, user_id, status, created_by) VALUES
    (v_org_a, v_admin_a, 'active', v_admin_a),
    (v_org_a, v_parent_full, 'active', v_admin_a),
    (v_org_a, v_parent_view, 'active', v_admin_a),
    (v_org_a, v_teacher_linked, 'active', v_admin_a),
    (v_org_a, v_teacher_unlinked, 'active', v_admin_a),
    (v_org_b, v_admin_b, 'active', v_admin_b);

  SELECT id INTO v_role_admin FROM public.roles WHERE code = 'org_admin';
  SELECT id INTO v_role_parent FROM public.roles WHERE code = 'parent_guardian';
  SELECT id INTO v_role_teacher FROM public.roles WHERE code = 'teacher';
  IF v_role_admin IS NULL OR v_role_parent IS NULL OR v_role_teacher IS NULL THEN
    RAISE EXCEPTION 'base roles missing in disposable database';
  END IF;

  INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by) VALUES
    (v_org_a, v_admin_a, v_role_admin, 'active', v_admin_a),
    (v_org_b, v_admin_b, v_role_admin, 'active', v_admin_b),
    (v_org_a, v_parent_full, v_role_parent, 'active', v_admin_a),
    (v_org_a, v_parent_view, v_role_parent, 'active', v_admin_a);

  INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
  VALUES (v_org_a, v_teacher_linked, v_role_teacher, 'active', v_admin_a)
  RETURNING id INTO v_ur_teacher_linked;

  INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
  VALUES (v_org_a, v_teacher_unlinked, v_role_teacher, 'active', v_admin_a)
  RETURNING id INTO v_ur_teacher_unlinked;

  -- A Teacher role that belongs to the OTHER tenant: used for the cross-tenant
  -- instructor-assignment denial.
  INSERT INTO public.user_roles (organization_id, user_id, role_id, status, created_by)
  VALUES (v_org_b, v_admin_b, v_role_teacher, 'active', v_admin_b)
  RETURNING id INTO v_ur_teacher_b;

  INSERT INTO public.students (organization_id, created_by, first_name, last_name)
  VALUES (v_org_a, v_admin_a, 'Linked', 'Learner') RETURNING id INTO v_student_linked;
  INSERT INTO public.students (organization_id, created_by, first_name, last_name)
  VALUES (v_org_a, v_admin_a, 'Other', 'Learner') RETURNING id INTO v_student_other;

  INSERT INTO public.parent_student_relationships
    (organization_id, parent_id, student_id, role_subtype, permission_level, status, created_by)
  VALUES
    (v_org_a, v_parent_full, v_student_linked, 'legal_guardian', 'full_management', 'active', v_admin_a),
    (v_org_a, v_parent_view, v_student_other, 'legal_guardian', 'view_only', 'active', v_admin_a);

  -- Only the "linked" teacher already has an authorized relationship.
  INSERT INTO public.teacher_student_relationships
    (organization_id, teacher_id, student_id, status, created_by)
  VALUES (v_org_a, v_teacher_linked, v_student_linked, 'active', v_admin_a);

  SET LOCAL ROLE authenticated;

  -- ============================================= DENY: non-admin authoring
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_full, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.programmes (organization_id, authoring_organization_id, name, category)
    VALUES (v_org_a, v_org_a, 'Guardian Club', 'sport');
    RAISE EXCEPTION 'DENY FAILED: a guardian created a programme';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_teacher_linked, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.programmes (organization_id, authoring_organization_id, name, category)
    VALUES (v_org_a, v_org_a, 'Teacher Club', 'sport');
    RAISE EXCEPTION 'DENY FAILED: a teacher created a programme';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- ================================================ ALLOW: org admin authors
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);

  INSERT INTO public.programmes
    (organization_id, authoring_organization_id, name, category, capacity, status)
  VALUES (v_org_a, v_org_a, 'Chess Club', 'enrichment', 1, 'draft')
  RETURNING id INTO v_prog;

  -- ------------------------------- DENY: a draft is invisible to members
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_full, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.programmes WHERE id = v_prog;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: a draft programme is visible to an ordinary member';
  END IF;

  -- ------------------------------- DENY: enrollment into a draft programme
  BEGIN
    PERFORM public.enroll_student_in_programme(v_prog, v_student_linked);
    RAISE EXCEPTION 'DENY FAILED: a learner was enrolled into a draft programme';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%published programme can accept enrollments%' THEN RAISE; END IF;
  END;

  -- ------------------------------------------------- publish the programme
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  UPDATE public.programmes SET status = 'published' WHERE id = v_prog;
  IF NOT FOUND THEN RAISE EXCEPTION 'ALLOW FAILED: org admin cannot publish a programme'; END IF;

  INSERT INTO public.programme_instructors
    (organization_id, programme_id, user_role_id, created_by)
  VALUES (v_org_a, v_prog, v_ur_teacher_linked, v_admin_a);
  INSERT INTO public.programme_instructors
    (organization_id, programme_id, user_role_id, created_by)
  VALUES (v_org_a, v_prog, v_ur_teacher_unlinked, v_admin_a);

  -- ------------------------------ DENY: cross-tenant instructor assignment
  BEGIN
    INSERT INTO public.programme_instructors
      (organization_id, programme_id, user_role_id, created_by)
    VALUES (v_org_a, v_prog, v_ur_teacher_b, v_admin_a);
    RAISE EXCEPTION 'DENY FAILED: an instructor from another tenant was assigned';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%Cross-tenant instructor assignment%' THEN RAISE; END IF;
  END;

  -- --------------------------------- DENY: an instructor assigning themselves
  -- A teacher has no instructor-management authority at all, and the
  -- validation trigger additionally forbids self-attribution. Either fail-closed
  -- outcome is an acceptable denial; a successful insert is not.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_teacher_linked, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.programme_instructors
      (organization_id, programme_id, user_role_id, created_by)
    VALUES (v_org_a, v_prog, v_ur_teacher_linked, v_teacher_linked);
    RAISE EXCEPTION 'DENY FAILED: a teacher assigned themselves as instructor';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
      IF sqlerrm NOT LIKE '%cannot assign themselves%' THEN RAISE; END IF;
  END;


  -- ---------------------------- ALLOW: published programme visible to members
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_full, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.programmes WHERE id = v_prog;
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: a published programme is invisible to a tenant member';
  END IF;

  -- ------------------------------------------ DENY: cross-tenant visibility
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_b, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.programmes WHERE id = v_prog;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: another tenant''s administrator can read this programme';
  END IF;

  -- ------------------------------------------------ DENY: unrelated outsider
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_outsider, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.programmes WHERE id = v_prog;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: a non-member can read a programme';
  END IF;
  BEGIN
    PERFORM public.enroll_student_in_programme(v_prog, v_student_linked);
    RAISE EXCEPTION 'DENY FAILED: a non-member enrolled a learner';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%Not authorized to enroll%' THEN RAISE; END IF;
  END;

  -- ------------------------- DENY: view-only guardian, and another's learner
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_view, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.enroll_student_in_programme(v_prog, v_student_other);
    RAISE EXCEPTION 'DENY FAILED: a view-only guardian enrolled their learner';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%Not authorized to enroll%' THEN RAISE; END IF;
  END;

  -- ---------- DENY: assigned instructor WITHOUT an existing relationship
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_teacher_unlinked, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.enroll_student_in_programme(v_prog, v_student_other);
    RAISE EXCEPTION 'DENY FAILED: an instructor enrolled an unrelated learner';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%Not authorized to enroll%' THEN RAISE; END IF;
  END;

  -- ------------- ALLOW: assigned instructor WITH an existing relationship
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_teacher_linked, 'role', 'authenticated')::text, true);
  v_enrollment := public.enroll_student_in_programme(v_prog, v_student_linked);
  IF v_enrollment IS NULL THEN
    RAISE EXCEPTION 'ALLOW FAILED: an assigned instructor with a relationship was refused';
  END IF;
  IF (SELECT status FROM public.programme_enrollments WHERE id = v_enrollment) <> 'enrolled' THEN
    RAISE EXCEPTION 'LIFECYCLE FAILED: a new enrollment did not start as enrolled';
  END IF;

  -- --------------------------------- DENY: a duplicate current enrollment
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_full, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.enroll_student_in_programme(v_prog, v_student_linked);
    RAISE EXCEPTION 'DENY FAILED: a duplicate current enrollment was created';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%already has a current enrollment%' THEN RAISE; END IF;
  END;

  -- ------------------------------------------------- DENY: capacity is full
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.enroll_student_in_programme(v_prog, v_student_other);
    RAISE EXCEPTION 'DENY FAILED: the last place was given twice';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%This programme is full%' THEN RAISE; END IF;
  END;

  -- ---------------------- DENY: shrinking capacity below current occupancy
  INSERT INTO public.programmes
    (organization_id, authoring_organization_id, name, category, capacity, status)
  VALUES (v_org_a, v_org_a, 'Choir', 'music', NULL, 'published')
  RETURNING id INTO v_prog_unlimited;

  PERFORM public.enroll_student_in_programme(v_prog_unlimited, v_student_linked);
  PERFORM public.enroll_student_in_programme(v_prog_unlimited, v_student_other);

  BEGIN
    UPDATE public.programmes SET capacity = 1 WHERE id = v_prog_unlimited;
    RAISE EXCEPTION 'DENY FAILED: capacity was shrunk below current occupancy';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%Capacity cannot be reduced%' THEN RAISE; END IF;
  END;

  -- =================================================== lifecycle transitions
  BEGIN
    PERFORM public.set_programme_enrollment_status(v_enrollment, 'completed');
    RAISE EXCEPTION 'DENY FAILED: enrolled -> completed was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%Invalid programme enrollment transition%' THEN RAISE; END IF;
  END;

  PERFORM public.set_programme_enrollment_status(v_enrollment, 'active');
  IF (SELECT status FROM public.programme_enrollments WHERE id = v_enrollment) <> 'active' THEN
    RAISE EXCEPTION 'ALLOW FAILED: org admin could not activate an enrollment';
  END IF;
  IF (SELECT activated_at FROM public.programme_enrollments WHERE id = v_enrollment) IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE FAILED: activated_at was not database-assigned';
  END IF;

  PERFORM public.set_programme_enrollment_status(v_enrollment, 'completed');
  IF (SELECT completed_at FROM public.programme_enrollments WHERE id = v_enrollment) IS NULL THEN
    RAISE EXCEPTION 'LIFECYCLE FAILED: completed_at was not database-assigned';
  END IF;

  -- ------------------- DENY: a guardian moving an enrollment through its life
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_full, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.set_programme_enrollment_status(v_enrollment, 'archived');
    RAISE EXCEPTION 'DENY FAILED: a guardian changed an enrollment status';
  EXCEPTION WHEN raise_exception THEN
    IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
    IF sqlerrm NOT LIKE '%Only an Organization Administrator%' THEN RAISE; END IF;
  END;

  -- ALLOW read: the full-management guardian can see their learner's record.
  SELECT count(*) INTO v_visible FROM public.programme_enrollments WHERE id = v_enrollment;
  IF v_visible <> 1 THEN
    RAISE EXCEPTION 'ALLOW FAILED: a guardian cannot read their learner''s enrollment';
  END IF;

  -- DENY read: an unrelated guardian cannot.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_parent_view, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.programme_enrollments WHERE id = v_enrollment;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: an unrelated guardian read another learner''s enrollment';
  END IF;

  -- DENY read: another tenant sees nothing at all.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_b, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.programme_enrollments;
  IF v_visible <> 0 THEN
    RAISE EXCEPTION 'DENY FAILED: cross-tenant programme enrollments are readable';
  END IF;

  -- ============================================= history cannot be destroyed
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin_a, 'role', 'authenticated')::text, true);
  BEGIN
    DELETE FROM public.programme_enrollments WHERE id = v_enrollment;
    RAISE EXCEPTION 'DENY FAILED: an enrollment record was deleted';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
      IF sqlerrm NOT LIKE '%cannot be deleted%' THEN RAISE; END IF;
  END;

  -- ======================================================= anonymous denial
  RESET ROLE;
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  BEGIN
    SELECT count(*) INTO v_visible FROM public.programmes;
    IF v_visible <> 0 THEN
      RAISE EXCEPTION 'DENY FAILED: anonymous callers can read programmes';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO v_visible FROM public.programme_enrollments;
    IF v_visible <> 0 THEN
      RAISE EXCEPTION 'DENY FAILED: anonymous callers can read programme enrollments';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.enroll_student_in_programme(v_prog, v_student_other);
    RAISE EXCEPTION 'DENY FAILED: an anonymous caller invoked the enrollment RPC';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN raise_exception THEN
      IF sqlerrm LIKE 'DENY FAILED%' THEN RAISE; END IF;
      IF sqlerrm NOT LIKE '%Authentication required%'
         AND sqlerrm NOT LIKE '%Not authorized%' THEN RAISE; END IF;
  END;

  -- ============================================================ audit trail
  RESET ROLE;
  SELECT count(*) INTO v_count FROM public.audit_logs
   WHERE entity_type = 'programmes' AND entity_id = v_prog AND actor_user_id = v_admin_a;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'AUDIT FAILED: no programme audit entry was written';
  END IF;

  SELECT count(*) INTO v_count FROM public.audit_logs
   WHERE entity_type = 'programme_enrollments' AND entity_id = v_enrollment;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'AUDIT FAILED: enrollment lifecycle changes were not audited';
  END IF;

  SELECT count(*) INTO v_count FROM public.audit_logs
   WHERE entity_type = 'programme_instructors' AND organization_id = v_org_a;
  IF v_count < 2 THEN
    RAISE EXCEPTION 'AUDIT FAILED: instructor assignments were not audited';
  END IF;

  RAISE NOTICE '[stage2-rls] all allow/deny, capacity, lifecycle and audit assertions passed';
END
$stage2$;

ROLLBACK;
