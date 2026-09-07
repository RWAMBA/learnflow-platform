-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated; REVOKE FROM PUBLIC does not remove those explicit grants.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'submit_public_inquiry',
        'request_newsletter_subscription',
        'confirm_newsletter_subscription',
        'withdraw_newsletter_subscription',
        'consume_rate_limit',
        'purge_expired_throttle_windows',
        'purge_expired_public_submissions'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$$;

DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('submit_public_inquiry','request_newsletter_subscription',
                      'confirm_newsletter_subscription','withdraw_newsletter_subscription',
                      'consume_rate_limit','purge_expired_throttle_windows',
                      'purge_expired_public_submissions')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION: % Stage 3 routine(s) still reachable by anon/authenticated', v_bad;
  END IF;
END
$$;
