-- Stage 2 residue proof.
-- The principal test transaction always ends in ROLLBACK, so the disposable
-- database must contain no rows written by it. Any residue fails the job.
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.programmes;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % programmes rows persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.programme_instructors;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % programme_instructors rows persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.programme_enrollments;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % programme_enrollments rows persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.organizations
   WHERE name LIKE 'Disposable Org S2%';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % disposable Stage 2 organizations persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM auth.users WHERE email LIKE 's2-%@example.test';
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % disposable Stage 2 auth users persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.audit_logs
   WHERE entity_type IN ('programmes', 'programme_instructors', 'programme_enrollments');
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % Stage 2 audit rows persisted', v_count;
  END IF;
  RAISE NOTICE '[stage2-residue] OK - zero residue, transaction was rolled back';
END
$$;
