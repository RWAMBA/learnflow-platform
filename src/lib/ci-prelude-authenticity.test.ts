import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const prelude = readFileSync("scripts/rls/ci-prelude.sql", "utf8");
const verify = readFileSync("scripts/rls/ci-prelude-verify.sql", "utf8");
const workflow = readFileSync(".github/workflows/rls-principal-tests.yml", "utf8");

const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();

/**
 * Authoritative hosted definition, captured from the hosted project with
 * pg_get_functiondef('app_private.rls_auto_enable()'::regprocedure).
 */
const HOSTED_DEF = `CREATE OR REPLACE FUNCTION app_private.rls_auto_enable()
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
$function$`;

describe("CI prelude reproduces the authoritative hosted prehistory object", () => {
  it("contains the hosted definition verbatim, only re-schema'd to public", () => {
    const body = prelude.slice(prelude.indexOf("CREATE OR REPLACE FUNCTION"));
    const fnOnly = body.slice(0, body.indexOf("$function$;") + "$function$".length);
    expect(normalize(fnOnly)).toBe(
      normalize(HOSTED_DEF.replace("app_private.rls_auto_enable", "public.rls_auto_enable")),
    );
  });

  it("is not a fabricated no-op", () => {
    expect(prelude).toContain("pg_event_trigger_ddl_commands()");
    expect(prelude).toContain("enable row level security");
    expect(prelude).not.toMatch(/intentionally empty/i);
  });

  it("reproduces the hosted security metadata", () => {
    expect(prelude).toContain("SECURITY DEFINER");
    expect(prelude).toContain("SET search_path TO 'pg_catalog'");
    expect(prelude).toContain("OWNER TO postgres");
    expect(prelude).toContain("REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC");
    expect(prelude).toContain(
      "GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres, anon, authenticated, service_role",
    );
  });

  it("reproduces the dependent event trigger", () => {
    expect(prelude).toContain("CREATE EVENT TRIGGER ensure_rls");
    expect(prelude).toContain("ON ddl_command_end");
    expect(prelude).toContain("WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')");
  });

  it("is verified after replay and never touches hosted endpoints", () => {
    expect(verify).toContain("app_private");
    expect(verify).toContain("is not the authoritative implementation");
    expect(workflow).toContain("scripts/rls/ci-prelude-verify.sql");
    expect(workflow).toContain("127.0.0.1:54322");
    expect(workflow).not.toContain("pull_request_target");
    expect(workflow).toContain("supabase stop --no-backup");
  });
});
