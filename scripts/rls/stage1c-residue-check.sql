-- Stage 1C residue proof.
-- The principal test transaction always ends in ROLLBACK, so the disposable
-- database must contain no rows written by it. Any residue fails the job.
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.curriculum_enrollments;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % curriculum_enrollments rows persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.academic_periods;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % academic_periods rows persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.organizations
   WHERE name LIKE 'Disposable Org %';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % disposable organizations persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM auth.users WHERE email LIKE '%@example.test';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % disposable auth users persisted', v_count;
  END IF;
  RAISE NOTICE '[stage1c-residue] OK - zero residue, transaction was rolled back';
END
$$;
