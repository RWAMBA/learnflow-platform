-- Disposable-CI prelude, applied to an EMPTY local database BEFORE the migration
-- history is replayed. Never applied to any hosted project.
--
-- Why this exists: migration 20260731093949 runs
--   alter function public.rls_auto_enable() set schema app_private;
-- but no migration in this repository ever creates public.rls_auto_enable().
-- The object was created out-of-band on the hosted project, so a fresh replay
-- fails with: function public.rls_auto_enable() does not exist.
--
-- The body below is NOT an invented no-op. It is the authoritative hosted
-- definition, captured verbatim from
--   pg_get_functiondef('app_private.rls_auto_enable()'::regprocedure)
-- on the hosted project, with only the schema qualifier changed from
-- app_private to public so the historical migration can move it normally.
-- Hosted metadata reproduced here exactly:
--   owner       : postgres
--   language    : plpgsql
--   returns     : event_trigger
--   security    : SECURITY DEFINER
--   volatility  : VOLATILE
--   config      : SET search_path TO 'pg_catalog'
--   ACL         : {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   dependency  : EVENT TRIGGER ensure_rls ON ddl_command_end
--                 WHEN TAG IN ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
--                 EXECUTE FUNCTION app_private.rls_auto_enable()  (owner postgres, enabled 'O')

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- Reproduce the hosted owner and ACL exactly (local stack superuser is postgres).
ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres, anon, authenticated, service_role;

-- Reproduce the hosted dependent event trigger, so the replay observes the same
-- DDL-time behaviour the hosted project had while this history was applied.
DROP EVENT TRIGGER IF EXISTS ensure_rls;
CREATE EVENT TRIGGER ensure_rls
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  EXECUTE FUNCTION public.rls_auto_enable();
