-- Phase 10 Stage 1 — legacy learner placement cutover (additive, idempotent).
-- Does not modify any previously applied migration. Creates no new curriculum
-- content and grants no curriculum access: availability remains governed by
-- public.curriculum_version_is_available.

-- 1. Fail closed if the duplicate-primary guard is absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'curriculum_enrollments_one_active_primary'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: one-active-primary guard index missing';
  END IF;
END
$$;

-- 2. Deterministic resolver. Returns a curriculum version only when the legacy
--    academic level resolves to exactly one current version. Ambiguity yields
--    NULL, which is skipped rather than guessed.
CREATE OR REPLACE FUNCTION app_private.resolve_legacy_placement_version(p_grade_id uuid)
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
    WHERE g.id = p_grade_id
      AND v.is_current
  ) c
  WHERE c.version_count = 1;
$fn$;

REVOKE ALL ON FUNCTION app_private.resolve_legacy_placement_version(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.resolve_legacy_placement_version(uuid) FROM anon;
REVOKE ALL ON FUNCTION app_private.resolve_legacy_placement_version(uuid) FROM authenticated;

-- 3. Idempotent backfill. Only learners with a legacy academic level, a unique
--    version mapping and no existing primary enrolment are touched.
DO $$
DECLARE
  r record;
  v_version uuid;
  v_id uuid;
  v_created integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.grade_id, s.pathway_id, s.created_at
    FROM public.students s
    WHERE s.grade_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.curriculum_enrollments e
        WHERE e.student_id = s.id AND e.enrollment_category = 'primary'
      )
    ORDER BY s.created_at
  LOOP
    v_version := app_private.resolve_legacy_placement_version(r.grade_id);
    IF v_version IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- The lifecycle trigger forces INSERT to land in 'pending' and owns every
    -- lifecycle timestamp; activation is a separate, trigger-validated step.
    INSERT INTO public.curriculum_enrollments (
      student_id, curriculum_version_id, academic_level_id, track_id,
      academic_period_id, enrollment_category, status, created_at
    )
    VALUES (
      r.id, v_version, r.grade_id, r.pathway_id,
      NULL, 'primary', 'pending', r.created_at
    )
    RETURNING id INTO v_id;

    UPDATE public.curriculum_enrollments
      SET status = 'active'
      WHERE id = v_id;

    v_created := v_created + 1;
  END LOOP;

  RAISE NOTICE 'legacy placement backfill: % created, % skipped (ambiguous)', v_created, v_skipped;
END
$$;

-- 4. Permanent verification surface: learners still governed only by the legacy
--    columns. Platform Administrators consume this through the reconciliation
--    console; a non-empty result blocks Stage 1 cutover.
CREATE OR REPLACE FUNCTION app_private.unreconciled_legacy_placements()
RETURNS TABLE(student_id uuid, organization_id uuid, grade_id uuid, resolvable boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT s.id, s.organization_id, s.grade_id,
         app_private.resolve_legacy_placement_version(s.grade_id) IS NOT NULL
  FROM public.students s
  WHERE s.grade_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.curriculum_enrollments e
      WHERE e.student_id = s.id
        AND e.enrollment_category = 'primary'
        AND e.status IN ('pending','active')
    );
$fn$;

REVOKE ALL ON FUNCTION app_private.unreconciled_legacy_placements() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.unreconciled_legacy_placements() FROM anon;
REVOKE ALL ON FUNCTION app_private.unreconciled_legacy_placements() FROM authenticated;

-- 5. Postconditions: no uniquely-resolvable learner may remain unreconciled and
--    no learner may hold two primary enrolments.
DO $$
DECLARE
  v_left integer;
  v_dupes integer;
BEGIN
  SELECT count(*) INTO v_left
    FROM app_private.unreconciled_legacy_placements() u
    WHERE u.resolvable;
  IF v_left > 0 THEN
    RAISE EXCEPTION 'Postcondition failed: % resolvable legacy placement(s) not reconciled', v_left;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT student_id
    FROM public.curriculum_enrollments
    WHERE enrollment_category = 'primary' AND status IN ('pending','active')
    GROUP BY student_id HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'Postcondition failed: % learner(s) hold duplicate primary enrollments', v_dupes;
  END IF;
END
$$;