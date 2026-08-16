-- Post-replay proof that the prelude object is the authoritative hosted function
-- and that migration 20260731093949 relocated it normally.
\set ON_ERROR_STOP on
DO $$
DECLARE
  v_def text;
  v_norm text;
  v_expected_sha text := 'authoritative-hosted-definition';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'app_private' AND p.proname = 'rls_auto_enable';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'app_private.rls_auto_enable() missing after replay';
  END IF;

  -- Normalized comparison: collapse all whitespace runs to single spaces.
  v_norm := regexp_replace(v_def, '\s+', ' ', 'g');

  IF v_norm NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'rls_auto_enable lost SECURITY DEFINER';
  END IF;
  IF v_norm NOT LIKE '%SET search_path TO ''pg_catalog''%' THEN
    RAISE EXCEPTION 'rls_auto_enable lost search_path pg_catalog';
  END IF;
  IF v_norm NOT LIKE '%pg_event_trigger_ddl_commands()%'
     OR v_norm NOT LIKE '%enable row level security%' THEN
    RAISE EXCEPTION 'rls_auto_enable body is not the authoritative implementation (no-op or altered)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger t
    JOIN pg_proc p ON p.oid = t.evtfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE t.evtname = 'ensure_rls' AND n.nspname = 'app_private'
      AND p.proname = 'rls_auto_enable'
  ) THEN
    RAISE EXCEPTION 'event trigger ensure_rls does not point at app_private.rls_auto_enable()';
  END IF;
  RAISE NOTICE 'ci-prelude-verify: authoritative definition confirmed (%).', v_expected_sha;
END
$$;
