begin;

alter table public.security_events
  drop constraint if exists security_events_event_type_check;

alter table public.security_events
  add constraint security_events_event_type_check
  check (event_type in (
    'failed_login',
    'account_lockout',
    'suspicious_invitation_activity',
    'excessive_password_reset_requests',
    'mfa_enroll_started',
    'mfa_factor_verified',
    'mfa_challenge_failed',
    'mfa_unenroll',
    'mfa_admin_factor_reset',
    'mfa_enforcement_activated',
    'other'
  ));

create or replace function app_private.has_aal2()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(
      case
        when jsonb_typeof(coalesce(auth.jwt(), '{}'::jsonb) -> 'aal') = 'string'
          then auth.jwt() ->> 'aal'
        else null
      end,
      ''
    ),
    'aal1'
  ) = 'aal2';
$$;

revoke all on function app_private.has_aal2() from public;
grant execute on function app_private.has_aal2() to authenticated, service_role;

comment on function app_private.has_aal2() is
  'SEC-006: true only when the verified request JWT carries a string aal claim equal to aal2. Missing, null, malformed, non-string and anonymous claims all return false.';

create table public.organization_security_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  teacher_mfa_required boolean not null default false,
  tutor_mfa_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organization_security_settings is
  'SEC-006: per-organization security policy. Absence of a row means optional MFA for Teacher/Tutor only. Mandatory MFA for Platform and Organization Administrators is not configurable here.';

revoke all on public.organization_security_settings from public;
revoke all on public.organization_security_settings from anon;
grant select on public.organization_security_settings to authenticated;
grant all on public.organization_security_settings to service_role;

alter table public.organization_security_settings enable row level security;

create policy organization_security_settings_member_read
  on public.organization_security_settings
  for select to authenticated
  using (
    app_private.is_platform_admin()
    or organization_id in (select app_private.auth_organization_ids())
  );

create policy organization_security_settings_platform_admin_write
  on public.organization_security_settings
  for all to authenticated
  using (app_private.is_platform_admin() and app_private.has_aal2())
  with check (app_private.is_platform_admin() and app_private.has_aal2());

create trigger organization_security_settings_set_updated_at
  before update on public.organization_security_settings
  for each row execute function public.set_updated_at();

commit;