-- Stage 1 storage residue proof.
-- The storage principal transaction always ends in ROLLBACK, so the disposable
-- database must contain no objects, buckets or rights rows written by it.
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count FROM storage.objects;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % storage objects persisted', v_count;
  END IF;
  -- Only the approved baseline private buckets may exist. Anything created by
  -- the principal proof itself must have rolled back.
  SELECT count(*) INTO v_count FROM storage.buckets
   WHERE id NOT IN (
     'curriculum-rights-evidence',
     'instructor-applications'
   );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % unexpected storage bucket(s) persisted', v_count;
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE public) THEN
    RAISE EXCEPTION 'RESIDUE: a public storage bucket exists';
  END IF;
  SELECT count(*) INTO v_count FROM public.rights_grants;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % rights grants persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.source_artifacts;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % source artifacts persisted', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.platform_admins;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % platform admins persisted', v_count;
  END IF;
  RAISE NOTICE '[stage1-storage-residue] OK - zero mutable fixture residue, transaction was rolled back';
END
$$;
