-- Stage 2 RLS helper privilege correction (additive; no policy or body changes).
--
-- The Stage 2 migration revoked EXECUTE on every app_private programme helper
-- from authenticated. Two of those helpers are invoked directly by RLS policies
-- on public.programmes, public.programme_instructors and
-- public.programme_enrollments, so the policy could not even be evaluated by an
-- authorized principal: PostgreSQL raised "permission denied for function
-- can_manage_programmes" before any authorization decision was made.
--
-- Only the two POLICY-INVOKED helpers are granted here. The internal helpers
-- (programme_organization, programme_occupied_count, is_programme_instructor)
-- are called exclusively from inside SECURITY DEFINER bodies and stay revoked,
-- as do all validation, lifecycle and audit trigger helpers.

DO $pre$
BEGIN
  IF to_regprocedure('app_private.can_manage_programmes(uuid)') IS NULL
     OR to_regprocedure('app_private.can_enroll_in_programme(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: Stage 2 programme policy helpers are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'programmes'
       AND policyname = 'programmes_insert'
       AND with_check LIKE '%can_manage_programmes%'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: programmes_insert policy is not the expected helper-based policy';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'programme_enrollments'
       AND policyname = 'programme_enrollments_insert'
       AND with_check LIKE '%can_enroll_in_programme%'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: programme_enrollments_insert policy is not the expected helper-based policy';
  END IF;
END
$pre$;

-- Keep anon and PUBLIC revoked, explicitly and idempotently.
REVOKE ALL ON FUNCTION app_private.can_manage_programmes(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.can_enroll_in_programme(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION app_private.can_manage_programmes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.can_enroll_in_programme(uuid, uuid) TO authenticated, service_role;

DO $post$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'app_private.can_manage_programmes(uuid)',
      'app_private.can_enroll_in_programme(uuid, uuid)'
    ]) AS sig
  LOOP
    IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Postcondition failed: authenticated cannot execute %', r.sig;
    END IF;
    IF NOT has_function_privilege('service_role', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Postcondition failed: service_role cannot execute %', r.sig;
    END IF;
    IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Postcondition failed: anon must not execute %', r.sig;
    END IF;
  END LOOP;

  -- Internal-only helpers must remain unreachable by ordinary principals.
  FOR r IN
    SELECT unnest(ARRAY[
      'app_private.programme_organization(uuid)',
      'app_private.programme_occupied_count(uuid)',
      'app_private.is_programme_instructor(uuid)'
    ]) AS sig
  LOOP
    IF has_function_privilege('authenticated', r.sig, 'EXECUTE')
       OR has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'Postcondition failed: internal helper % is exposed', r.sig;
    END IF;
  END LOOP;
END
$post$;