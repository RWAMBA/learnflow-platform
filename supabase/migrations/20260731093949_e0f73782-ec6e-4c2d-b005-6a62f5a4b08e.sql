create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated, anon, service_role;

alter function public.auth_organization_ids() set schema app_private;
alter function public.auth_user_role_ids(text) set schema app_private;
alter function public.can_manage_student(uuid) set schema app_private;
alter function public.can_view_student(uuid) set schema app_private;
alter function public.has_org_role(uuid, text) set schema app_private;
alter function public.is_platform_admin() set schema app_private;
alter function public.handle_new_user() set schema app_private;
alter function public.rls_auto_enable() set schema app_private;

-- Policies reference these functions by object id, so they keep working.
-- Callers still need EXECUTE for policy evaluation, but the functions are no
-- longer reachable through the exposed (public) API schema.
revoke all on function app_private.auth_organization_ids() from public;
revoke all on function app_private.auth_user_role_ids(text) from public;
revoke all on function app_private.can_manage_student(uuid) from public;
revoke all on function app_private.can_view_student(uuid) from public;
revoke all on function app_private.has_org_role(uuid, text) from public;
revoke all on function app_private.is_platform_admin() from public;
revoke all on function app_private.handle_new_user() from public;
revoke all on function app_private.rls_auto_enable() from public;

grant execute on function app_private.auth_organization_ids() to authenticated, anon, service_role;
grant execute on function app_private.auth_user_role_ids(text) to authenticated, anon, service_role;
grant execute on function app_private.can_manage_student(uuid) to authenticated, anon, service_role;
grant execute on function app_private.can_view_student(uuid) to authenticated, anon, service_role;
grant execute on function app_private.has_org_role(uuid, text) to authenticated, anon, service_role;
grant execute on function app_private.is_platform_admin() to authenticated, anon, service_role;
grant execute on function app_private.handle_new_user() to service_role;
