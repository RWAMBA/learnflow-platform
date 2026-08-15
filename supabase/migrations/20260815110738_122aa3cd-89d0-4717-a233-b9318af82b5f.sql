begin;

-- Least-privilege ACL correction for tamper-resistant security tables.
-- Additive only: no historical migration is altered, no data is changed.
-- RLS already restricts reads; these statements remove the unused (and
-- therefore misleading) table-level write privileges held by anon and
-- authenticated so that only server-controlled service_role paths can write.

revoke all on table public.security_events from public;
revoke all on table public.security_events from anon;
revoke all on table public.security_events from authenticated;
grant select on table public.security_events to authenticated;
grant all on table public.security_events to service_role;
alter table public.security_events enable row level security;

revoke all on table public.platform_admins from public;
revoke all on table public.platform_admins from anon;
revoke all on table public.platform_admins from authenticated;
grant select on table public.platform_admins to authenticated;
grant all on table public.platform_admins to service_role;
alter table public.platform_admins enable row level security;

comment on table public.security_events is
  'Tamper-resistant security event log. Writes are server-only (service_role); authenticated principals hold SELECT only and reads are further restricted to Platform Administrators by RLS.';

commit;