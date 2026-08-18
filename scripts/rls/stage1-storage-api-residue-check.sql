-- Stage 1 Storage HTTP API residue proof.
--
-- The API runner writes real, committed rows and objects, so it must remove
-- every one of them. The schema-defined evidence bucket is created by the
-- migration history and is therefore RETAINED; nothing else may survive.
DO $$
DECLARE
  v_count bigint;
  v_buckets text;
BEGIN
  SELECT count(*) INTO v_count FROM storage.objects;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % storage object(s) persisted after the API run', v_count;
  END IF;

  SELECT string_agg(id, ',' ORDER BY id) INTO v_buckets FROM storage.buckets;
  IF coalesce(v_buckets, '') <> 'curriculum-rights-evidence' THEN
    RAISE EXCEPTION 'RESIDUE: unexpected bucket set "%" (only the schema-defined evidence bucket may remain)', v_buckets;
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE public) THEN
    RAISE EXCEPTION 'RESIDUE: a public storage bucket exists';
  END IF;

  SELECT count(*) INTO v_count FROM public.rights_evidence_documents;
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % evidence document row(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.rights_grants;
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % rights grant(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.source_artifacts;
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % source artifact(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.rights_audit_log;
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % rights audit row(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.platform_admins;
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % platform admin(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.organizations WHERE name LIKE 'API Disposable Org%';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % fixture organization(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM auth.users WHERE email LIKE 'storage-api-%@example.test';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % fixture auth user(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.curricula WHERE code = 'APIDISP';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % fixture curricula', v_count; END IF;

  RAISE NOTICE '[stage1-storage-api-residue] OK - zero residue, evidence bucket retained';
END
$$;
