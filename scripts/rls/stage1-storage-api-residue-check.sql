-- Stage 1 Storage HTTP API residue proof.
--
-- The API runner writes real, committed rows and objects, so it must remove
-- every one of them. The schema-defined evidence bucket is created by the
-- migration history and is therefore RETAINED; nothing else may survive.
--
-- rights_audit_log is append-only. The runner therefore cannot (and must not)
-- delete the audit events its fixtures appended. It publishes their exact ids
-- in a manifest; only those precisely identified immutable rows may remain,
-- and they live only until the disposable environment is destroyed.
-- Invoke with: psql -v audit_ids="$(cat /tmp/stage1-storage-api-audit-manifest.txt)"
\if :{?audit_ids}
\else
\set audit_ids ''
\endif

-- psql does not interpolate variables inside dollar-quoted bodies, so the
-- manifest is materialized into a session-local temp table first (it vanishes
-- with the session and is therefore not residue).
CREATE TEMP TABLE expected_audit_events(id uuid PRIMARY KEY);
INSERT INTO expected_audit_events(id)
SELECT x::uuid FROM unnest(string_to_array(nullif(:'audit_ids', ''), ',')) AS x
WHERE nullif(trim(x), '') IS NOT NULL;

DO $$
DECLARE
  v_count bigint;
  v_buckets text;
  v_expected uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_expected FROM expected_audit_events;
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
  -- Mutable fixture residue must be zero; immutable audit residue must be
  -- exactly the manifest.
  SELECT count(*) INTO v_count
    FROM public.rights_audit_log WHERE NOT (id = ANY (v_expected));
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'RESIDUE: % unexpected (unmanifested) rights audit row(s)', v_count;
  END IF;
  SELECT count(*) INTO v_count
    FROM unnest(v_expected) e(id)
   WHERE NOT EXISTS (SELECT 1 FROM public.rights_audit_log a WHERE a.id = e.id);
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'AUDIT INTEGRITY: % manifested audit row(s) disappeared (append-only violated)', v_count;
  END IF;
  SELECT count(*) INTO v_count FROM public.platform_admins;
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % platform admin(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.organizations WHERE name LIKE 'API Disposable Org%';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % fixture organization(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM auth.users WHERE email LIKE 'storage-api-%@example.test';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % fixture auth user(s)', v_count; END IF;
  SELECT count(*) INTO v_count FROM public.curricula WHERE code = 'APIDISP';
  IF v_count <> 0 THEN RAISE EXCEPTION 'RESIDUE: % fixture curricula', v_count; END IF;

  RAISE NOTICE '[stage1-storage-api-residue] OK - zero mutable residue; % immutable audit event(s) retained; evidence bucket retained',
    coalesce(array_length(v_expected, 1), 0);
END
$$;
