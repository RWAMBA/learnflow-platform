-- Disposable-CI prelude, applied to an EMPTY local database BEFORE the migration
-- history is replayed.
--
-- Why this exists: migration 20260731093949 runs
--   alter function public.rls_auto_enable() set schema app_private;
-- but no migration in this repository ever creates public.rls_auto_enable().
-- The function was created out-of-band on the hosted project, so a fresh replay
-- fails with: function public.rls_auto_enable() does not exist.
--
-- This shim recreates that pre-existing object so the historical migration can be
-- replayed verbatim. It is a no-op body: no CREATE EVENT TRIGGER exists anywhere
-- in the migration history, so the real function is never invoked either. It is
-- never applied to any hosted project.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
as $$
begin
  -- intentionally empty: replay-compatibility shim only
  return;
end;
$$;
