begin;

-- SEC-006 corrective migration: least-privilege ACL for
-- public.organization_security_settings. Additive only; migration
-- 20260814230011 is left untouched.

revoke all on table public.organization_security_settings from public;
revoke all on table public.organization_security_settings from anon;
revoke all on table public.organization_security_settings from authenticated;

-- The implemented UI performs reads only; no authenticated write path exists.
grant select on table public.organization_security_settings to authenticated;

-- Server-only operations continue through the service role.
grant all on table public.organization_security_settings to service_role;

alter table public.organization_security_settings enable row level security;

-- Remove the FOR ALL write policy: with no write privileges granted to
-- authenticated it can never apply, and leaving it in place misrepresents an
-- active protection. Stage-two enforcement will introduce command-specific
-- policies together with the matching grants.
drop policy if exists organization_security_settings_platform_admin_write
  on public.organization_security_settings;

-- Read policy is re-asserted idempotently and unchanged in effect.
drop policy if exists organization_security_settings_member_read
  on public.organization_security_settings;

create policy organization_security_settings_member_read
  on public.organization_security_settings
  for select to authenticated
  using (
    app_private.is_platform_admin()
    or organization_id in (select app_private.auth_organization_ids())
  );

commit;