-- Phase 10 Stage 1 — controlled correction: atomic student creation with a real
-- curriculum enrollment. Additive and forward-only. No previously applied
-- migration is edited or re-executed. No curriculum content is created and no
-- availability, rights, readiness or activation state is changed.
-- STATUS: PENDING — deliberately not applied to production in this correction.

-- 1. Fail-closed preconditions. The correction refuses to install itself
--    against an unexpected starting state.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'curriculum_enrollments_one_active_primary'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: one-active-primary guard index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app_private' AND p.proname = 'has_org_role'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: app_private.has_org_role missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'curriculum_enrollments'
      AND column_name = 'enrollment_category'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: curriculum_enrollments.enrollment_category missing';
  END IF;
END
$$;

-- 2. Deterministic version resolution, private and reusable. Mirrors the proven
--    legacy resolver: exactly one current version resolves; zero or many yield
--    NULL so the caller fails closed instead of guessing.
CREATE OR REPLACE FUNCTION app_private.resolve_current_curriculum_version(p_academic_level_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT c.version_id
  FROM (
    SELECT min(v.id::text)::uuid AS version_id, count(*) AS version_count
    FROM public.grades g
    JOIN public.curriculum_versions v ON v.curriculum_id = g.curriculum_id
    WHERE g.id = p_academic_level_id
      AND v.is_current
  ) c
  WHERE c.version_count = 1;
$fn$;

REVOKE ALL ON FUNCTION app_private.resolve_current_curriculum_version(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.resolve_current_curriculum_version(uuid) FROM anon;
REVOKE ALL ON FUNCTION app_private.resolve_current_curriculum_version(uuid) FROM authenticated;

-- 3. Atomic creation entry point. One transaction creates the learner, the
--    guardian relationship and — when an academic level is supplied — one
--    pending primary curriculum enrollment. Any failure aborts the whole
--    function, so no orphan learner, partial relationship or partial enrollment
--    can survive. Tenant ownership is derived from the authenticated actor's
--    active membership; the client can never widen it.
CREATE OR REPLACE FUNCTION public.create_student_with_placement(
  p_organization_id uuid,
  p_first_name text,
  p_last_name text,
  p_date_of_birth date,
  p_academic_level_id uuid,
  p_track_id uuid,
  p_role_subtype text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_curriculum uuid;
  v_pathway_required boolean;
  v_version uuid;
  v_version_count integer;
  v_student uuid;
  v_enrollment uuid;
  v_primary_count integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'An organization is required';
  END IF;

  -- Authorization: only an active guardian or organization administrator of
  -- that exact tenant may create a learner there.
  IF NOT (
    app_private.has_org_role(p_organization_id, 'parent_guardian')
    OR app_private.has_org_role(p_organization_id, 'org_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized to create a student in this organization';
  END IF;

  IF p_role_subtype IS NULL OR p_role_subtype NOT IN
     ('biological_parent', 'legal_guardian', 'foster_parent', 'other_guardian') THEN
    RAISE EXCEPTION 'Invalid guardian relationship type';
  END IF;

  IF coalesce(btrim(p_first_name), '') = '' OR coalesce(btrim(p_last_name), '') = '' THEN
    RAISE EXCEPTION 'A first and last name are required';
  END IF;

  IF p_academic_level_id IS NULL AND p_track_id IS NOT NULL THEN
    RAISE EXCEPTION 'A pathway cannot be selected without a grade';
  END IF;

  IF p_academic_level_id IS NOT NULL THEN
    SELECT g.curriculum_id, g.pathway_required
      INTO v_curriculum, v_pathway_required
      FROM public.grades g
     WHERE g.id = p_academic_level_id;

    IF v_curriculum IS NULL THEN
      RAISE EXCEPTION 'That grade does not exist';
    END IF;

    SELECT count(*) INTO v_version_count
      FROM public.curriculum_versions v
     WHERE v.curriculum_id = v_curriculum
       AND v.is_current;

    IF v_version_count = 0 THEN
      RAISE EXCEPTION 'That grade has no current curriculum version, so a placement cannot be created';
    ELSIF v_version_count > 1 THEN
      RAISE EXCEPTION 'That grade resolves to more than one current curriculum version, so the placement is ambiguous';
    END IF;

    v_version := app_private.resolve_current_curriculum_version(p_academic_level_id);
    IF v_version IS NULL THEN
      RAISE EXCEPTION 'Unable to resolve a single current curriculum version for that grade';
    END IF;

    IF p_track_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.pathways p
        WHERE p.id = p_track_id AND p.grade_id = p_academic_level_id
      ) THEN
        RAISE EXCEPTION 'That pathway does not belong to the selected grade';
      END IF;
    ELSIF v_pathway_required THEN
      RAISE EXCEPTION 'That grade requires a pathway';
    END IF;
  END IF;

  -- Legacy placement columns are deliberately not written: curriculum_enrollments
  -- is the authoritative placement record.
  INSERT INTO public.students (organization_id, created_by, first_name, last_name, date_of_birth)
  VALUES (p_organization_id, v_actor, btrim(p_first_name), btrim(p_last_name), p_date_of_birth)
  RETURNING id INTO v_student;

  INSERT INTO public.parent_student_relationships (
    organization_id, parent_id, student_id, role_subtype,
    permission_level, status, invitation_status, created_by
  )
  VALUES (
    p_organization_id, v_actor, v_student, p_role_subtype,
    'full_management', 'active', 'accepted', v_actor
  );

  IF p_academic_level_id IS NOT NULL THEN
    INSERT INTO public.curriculum_enrollments (
      student_id, curriculum_version_id, academic_level_id, track_id,
      enrollment_category, status
    )
    VALUES (
      v_student, v_version, p_academic_level_id, p_track_id,
      'primary', 'pending'
    )
    RETURNING id INTO v_enrollment;
  END IF;

  INSERT INTO public.audit_logs (actor_user_id, organization_id, action, entity_type, entity_id, after_state)
  VALUES (
    v_actor, p_organization_id, 'student.created', 'students', v_student,
    jsonb_build_object('enrollment_id', v_enrollment, 'curriculum_version_id', v_version)
  );

  -- Postconditions: exactly one learner, one guardian relationship and at most
  -- one primary enrollment resulted from this call.
  SELECT count(*) INTO v_primary_count
    FROM public.curriculum_enrollments e
   WHERE e.student_id = v_student
     AND e.enrollment_category = 'primary'
     AND e.status IN ('pending', 'active');

  IF p_academic_level_id IS NOT NULL AND v_primary_count <> 1 THEN
    RAISE EXCEPTION 'Postcondition failed: expected exactly one primary enrollment';
  END IF;
  IF p_academic_level_id IS NULL AND v_primary_count <> 0 THEN
    RAISE EXCEPTION 'Postcondition failed: no enrollment may be invented without a grade';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.parent_student_relationships r
    WHERE r.student_id = v_student AND r.parent_id = v_actor AND r.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Postcondition failed: guardian relationship missing';
  END IF;

  RETURN jsonb_build_object('student_id', v_student, 'enrollment_id', v_enrollment);
END
$fn$;

-- 4. Minimum grants: signed-in application sessions only.
REVOKE ALL ON FUNCTION public.create_student_with_placement(uuid, text, text, date, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_student_with_placement(uuid, text, text, date, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_student_with_placement(uuid, text, text, date, uuid, uuid, text) TO authenticated;
