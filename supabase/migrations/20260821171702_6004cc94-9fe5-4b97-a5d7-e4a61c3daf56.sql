-- =====================================================================
-- Stage 2 continuation: atomic curriculum-enrollment transfer + one-time
-- forward-only recovery for the learner unplaced by the two-call defect.
-- Additive and idempotent. No history is rewritten or deleted.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Authorization helper: mirrors the existing curriculum_enrollments
--    UPDATE/INSERT policy exactly. No broadening.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_private.can_transfer_enrollment(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT app_private.is_platform_admin()
      OR EXISTS (
           SELECT 1 FROM public.students s
            WHERE s.id = p_student_id
              AND app_private.has_org_role(s.organization_id, 'org_admin')
         );
$$;

REVOKE ALL ON FUNCTION app_private.can_transfer_enrollment(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Atomic transfer RPC.
--    Single transaction: lock -> validate -> close source -> insert
--    replacement -> audit. Any failure aborts the whole statement, so the
--    source closure is rolled back with it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_curriculum_enrollment(
  p_enrollment_id        uuid,
  p_curriculum_version_id uuid,
  p_academic_level_id    uuid,
  p_track_id             uuid DEFAULT NULL,
  p_academic_period_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_student      uuid;
  v_org          uuid;
  v_category     text;
  v_status       text;
  v_curriculum   uuid;
  v_required     boolean;
  v_new          uuid;
  v_active_count integer;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Derive learner and tenant from the source row. Client-supplied student
  -- or organization identity is never accepted.
  SELECT e.student_id, e.enrollment_category, e.status
    INTO v_student, v_category, v_status
    FROM public.curriculum_enrollments e
   WHERE e.id = p_enrollment_id
   FOR UPDATE;

  IF v_student IS NULL THEN
    RAISE EXCEPTION 'That enrollment no longer exists';
  END IF;

  SELECT s.organization_id INTO v_org
    FROM public.students s WHERE s.id = v_student;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'That learner no longer exists';
  END IF;

  -- Authorization is re-evaluated inside the database, not trusted from
  -- the caller or from RLS alone.
  IF NOT app_private.can_transfer_enrollment(v_student) THEN
    RAISE EXCEPTION 'Not authorized to transfer this enrollment';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Only an active enrollment can be transferred';
  END IF;
  IF v_category <> 'primary' THEN
    RAISE EXCEPTION 'Only a primary placement can be transferred';
  END IF;

  -- Serialize concurrent transfers for this learner: lock every current
  -- primary row, then re-assert the source is the single active one.
  PERFORM 1 FROM public.curriculum_enrollments e
    WHERE e.student_id = v_student
      AND e.enrollment_category = 'primary'
      AND e.status IN ('pending', 'active')
    FOR UPDATE;

  SELECT count(*) INTO v_active_count
    FROM public.curriculum_enrollments e
   WHERE e.student_id = v_student
     AND e.enrollment_category = 'primary'
     AND e.status = 'active';
  IF v_active_count <> 1 THEN
    RAISE EXCEPTION 'The learner must have exactly one active primary placement to transfer';
  END IF;

  -- Destination validation: grade, curriculum, pathway and period must all
  -- agree with each other and with the learner tenant.
  SELECT g.curriculum_id, g.pathway_required
    INTO v_curriculum, v_required
    FROM public.grades g WHERE g.id = p_academic_level_id;
  IF v_curriculum IS NULL THEN
    RAISE EXCEPTION 'That grade does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.curriculum_versions v
     WHERE v.id = p_curriculum_version_id
       AND v.curriculum_id = v_curriculum
  ) THEN
    RAISE EXCEPTION 'That curriculum version does not belong to the selected grade';
  END IF;

  IF p_track_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pathways p
       WHERE p.id = p_track_id AND p.grade_id = p_academic_level_id
    ) THEN
      RAISE EXCEPTION 'That pathway does not belong to the selected grade';
    END IF;
  ELSIF v_required THEN
    RAISE EXCEPTION 'That grade requires a pathway';
  END IF;

  IF p_academic_period_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.academic_periods a
       WHERE a.id = p_academic_period_id AND a.organization_id = v_org
    ) THEN
      RAISE EXCEPTION 'That academic period belongs to a different organization';
    END IF;
  END IF;

  -- Stage 1 availability gate applies to every ordinary transfer.
  IF NOT public.curriculum_version_is_available(p_curriculum_version_id) THEN
    RAISE EXCEPTION 'That curriculum version is not available for enrollment';
  END IF;

  UPDATE public.curriculum_enrollments
     SET status = 'transferred', ended_at = now()
   WHERE id = p_enrollment_id;

  INSERT INTO public.curriculum_enrollments (
    student_id, curriculum_version_id, academic_level_id, track_id,
    academic_period_id, enrollment_category, status,
    transferred_from_enrollment_id
  ) VALUES (
    v_student, p_curriculum_version_id, p_academic_level_id, p_track_id,
    p_academic_period_id, 'primary', 'pending', p_enrollment_id
  )
  RETURNING id INTO v_new;

  -- The lifecycle guard owns activation and the enrolled_at timestamp:
  -- a placement is always created pending, then activated. Both statements
  -- run inside this single transaction, so the pair is atomic.
  UPDATE public.curriculum_enrollments SET status = 'active' WHERE id = v_new;

  INSERT INTO public.audit_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, before_state, after_state
  ) VALUES (
    v_actor, v_org, 'curriculum_enrollment.transferred', 'curriculum_enrollments', v_new,
    jsonb_build_object('source_enrollment_id', p_enrollment_id),
    jsonb_build_object(
      'enrollment_id', v_new,
      'curriculum_version_id', p_curriculum_version_id,
      'academic_level_id', p_academic_level_id,
      'track_id', p_track_id,
      'academic_period_id', p_academic_period_id
    )
  );

  SELECT count(*) INTO v_active_count
    FROM public.curriculum_enrollments e
   WHERE e.student_id = v_student
     AND e.enrollment_category = 'primary'
     AND e.status = 'active';
  IF v_active_count <> 1 THEN
    RAISE EXCEPTION 'Postcondition failed: expected exactly one active primary placement';
  END IF;

  RETURN jsonb_build_object(
    'enrollment_id', v_new,
    'source_enrollment_id', p_enrollment_id,
    'status', 'active'
  );
END
$$;

REVOKE ALL ON FUNCTION public.transfer_curriculum_enrollment(uuid, uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_curriculum_enrollment(uuid, uuid, uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. One-time, idempotent, fail-closed forward recovery.
--    The intended destination of the failed transfer is NOT recoverable:
--    no durable record of it exists. The learner's last proven valid
--    placement is therefore reproduced from the transferred source row.
--    This is incident recovery, not a curriculum-selection action, so the
--    availability gate is deliberately not applied to it.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_unplaced   integer;
  v_student    uuid;
  v_org        uuid;
  v_source     public.curriculum_enrollments%ROWTYPE;
  v_sources    integer;
  v_dupes      integer;
  v_new        uuid;
BEGIN
  SELECT count(*) INTO v_unplaced
    FROM public.students s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.curriculum_enrollments e
      WHERE e.student_id = s.id
        AND e.enrollment_category = 'primary'
        AND e.status = 'active');

  IF v_unplaced = 0 THEN
    RAISE NOTICE '[transfer-recovery] no unplaced learner; nothing to do (idempotent)';
    RETURN;
  END IF;

  IF v_unplaced <> 1 THEN
    RAISE EXCEPTION 'Precondition failed: expected exactly 1 affected learner, found %', v_unplaced;
  END IF;

  SELECT s.id, s.organization_id INTO v_student, v_org
    FROM public.students s
   WHERE NOT EXISTS (
     SELECT 1 FROM public.curriculum_enrollments e
      WHERE e.student_id = s.id
        AND e.enrollment_category = 'primary'
        AND e.status = 'active');

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: affected learner has no organization';
  END IF;

  SELECT count(*) INTO v_sources
    FROM public.curriculum_enrollments e
   WHERE e.student_id = v_student
     AND e.enrollment_category = 'primary'
     AND e.status = 'transferred';
  IF v_sources <> 1 THEN
    RAISE EXCEPTION 'Precondition failed: expected exactly 1 transferred primary row, found %', v_sources;
  END IF;

  SELECT * INTO v_source
    FROM public.curriculum_enrollments e
   WHERE e.student_id = v_student
     AND e.enrollment_category = 'primary'
     AND e.status = 'transferred'
   ORDER BY e.ended_at DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  IF v_source.curriculum_version_id IS NULL OR v_source.academic_level_id IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: the previous placement is incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.grades g
      JOIN public.curriculum_versions v ON v.curriculum_id = g.curriculum_id
     WHERE g.id = v_source.academic_level_id
       AND v.id = v_source.curriculum_version_id
  ) THEN
    RAISE EXCEPTION 'Precondition failed: previous grade and curriculum version do not agree';
  END IF;

  IF v_source.track_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pathways p
     WHERE p.id = v_source.track_id AND p.grade_id = v_source.academic_level_id
  ) THEN
    RAISE EXCEPTION 'Precondition failed: previous pathway does not belong to the previous grade';
  END IF;

  SELECT count(*) INTO v_dupes
    FROM public.curriculum_enrollments e
   WHERE e.student_id = v_student
     AND e.enrollment_category = 'primary'
     AND e.status IN ('pending', 'active');
  IF v_dupes <> 0 THEN
    RAISE EXCEPTION 'Precondition failed: learner already holds a current primary placement';
  END IF;

  INSERT INTO public.curriculum_enrollments (
    student_id, curriculum_version_id, academic_level_id, track_id,
    academic_period_id, enrollment_category, status,
    transferred_from_enrollment_id
  ) VALUES (
    v_student, v_source.curriculum_version_id, v_source.academic_level_id,
    v_source.track_id, v_source.academic_period_id, 'primary', 'pending',
    v_source.id
  )
  RETURNING id INTO v_new;

  UPDATE public.curriculum_enrollments SET status = 'active' WHERE id = v_new;

  INSERT INTO public.audit_logs (
    actor_user_id, organization_id, action, entity_type, entity_id, before_state, after_state
  ) VALUES (
    NULL, v_org, 'curriculum_enrollment.transfer_incident_recovered',
    'curriculum_enrollments', v_new,
    jsonb_build_object('source_enrollment_id', v_source.id, 'reason', 'non-atomic transfer left learner unplaced'),
    jsonb_build_object('enrollment_id', v_new, 'restored', 'last proven valid placement')
  );

  RAISE NOTICE '[transfer-recovery] restored last proven placement for 1 learner';
END
$$;

-- ---------------------------------------------------------------------
-- 4. Postconditions.
-- ---------------------------------------------------------------------
DO $$
DECLARE v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.students;
  IF v_n <> 3 THEN RAISE EXCEPTION 'Postcondition failed: students = %, expected 3', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.curriculum_enrollments
   WHERE enrollment_category = 'primary' AND status = 'active';
  IF v_n <> 3 THEN RAISE EXCEPTION 'Postcondition failed: active primary enrollments = %, expected 3', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.students s
   WHERE NOT EXISTS (SELECT 1 FROM public.curriculum_enrollments e
                      WHERE e.student_id = s.id AND e.enrollment_category = 'primary'
                        AND e.status = 'active');
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: % learner(s) unplaced', v_n; END IF;

  SELECT count(*) INTO v_n FROM (
    SELECT student_id FROM public.curriculum_enrollments
     WHERE enrollment_category = 'primary' AND status = 'active'
     GROUP BY student_id HAVING count(*) > 1) d;
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: % duplicate active primary placements', v_n; END IF;

  SELECT count(*) INTO v_n FROM app_private.unreconciled_legacy_placements();
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: % unreconciled legacy placements', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.curriculum_versions v
   WHERE public.curriculum_version_is_available(v.id);
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: % curriculum version(s) now pass the availability gate', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.grades g
    JOIN public.curricula c ON c.id = g.curriculum_id
   WHERE c.code = 'CBC';
  IF v_n <> 12 THEN RAISE EXCEPTION 'Postcondition failed: CBC grade count = %, expected 12', v_n; END IF;

  SELECT count(*) INTO v_n FROM public.grades g
   WHERE g.name ILIKE '%PP1%' OR g.name ILIKE '%PP2%' OR g.name ILIKE '%pre-primary%';
  IF v_n <> 0 THEN RAISE EXCEPTION 'Postcondition failed: % pre-primary level(s) present', v_n; END IF;

  RAISE NOTICE '[transfer-recovery] all postconditions satisfied';
END
$$;