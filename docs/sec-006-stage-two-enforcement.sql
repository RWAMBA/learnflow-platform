-- =====================================================================
-- SEC-006 STAGE TWO — AUTHORITATIVE AAL2 ENFORCEMENT (PREPARED, NOT APPLIED)
-- =====================================================================
-- This file is intentionally NOT in supabase/migrations/. Applying it before
-- the activation prerequisites in docs/sec-006-aal2-enforcement.md pass would
-- lock out every Platform Administrator (currently 1 active, 0 with a verified
-- factor).
--
-- Activation procedure:
--   1. Confirm >= 2 active Platform Administrators each hold a verified TOTP
--      factor on a separate secure device.
--   2. Copy this file verbatim into supabase/migrations/<timestamp>_sec006_stage_two_aal2.sql
--   3. Apply it and, in the SAME release, set MFA_ENFORCEMENT_ENABLED = true
--      in src/features/security/mfa.ts.
--
-- Every policy below preserves its ORIGINAL SEC-001..SEC-005 predicate
-- verbatim (copied from the live catalog) and adds AAL2 only as an additional
-- conjunct. MFA never grants a permission the principal did not already hold.
-- Parent/Guardian and Student policies are not modified.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
-- app_private.has_aal2() already exists (migration 20260814230011) and fails
-- closed on missing/null/malformed/non-string aal claims.

-- Conditional helper for organization-configurable Teacher/Tutor MFA. Absence
-- of a settings row means the requirement is OFF. A NULL organization_id
-- (platform-owned data) is never covered by a tenant setting.
create or replace function app_private.org_requires_mfa(_organization_id uuid, _role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when _organization_id is null then false
    else coalesce((
      select case _role
               when 'teacher' then s.teacher_mfa_required
               when 'tutor' then s.tutor_mfa_required
               else false
             end
      from public.organization_security_settings s
      where s.organization_id = _organization_id
    ), false)
  end;
$$;

alter function app_private.org_requires_mfa(uuid, text) owner to postgres;
revoke all on function app_private.org_requires_mfa(uuid, text) from public;
grant execute on function app_private.org_requires_mfa(uuid, text) to authenticated, service_role;

comment on function app_private.org_requires_mfa(uuid, text) is
  'SEC-006 stage two: true only when the organization explicitly requires MFA for the given non-administrator role. Never applies to Platform or Organization Administrators, whose AAL2 requirement is unconditional.';

-- Convenience predicate: satisfied when the tenant policy does not demand MFA
-- for the role, or the caller has already reached AAL2.
create or replace function app_private.org_mfa_satisfied(_organization_id uuid, _role text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (not app_private.org_requires_mfa(_organization_id, _role))
      or app_private.has_aal2();
$$;

revoke all on function app_private.org_mfa_satisfied(uuid, text) from public;
grant execute on function app_private.org_mfa_satisfied(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Platform-owned structural curriculum writes (Platform Admin + AAL2)
-- ---------------------------------------------------------------------
drop policy if exists curriculum_versions_insert on public.curriculum_versions;
create policy curriculum_versions_insert on public.curriculum_versions
  for insert to authenticated
  with check (((organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2());

drop policy if exists curriculum_versions_update on public.curriculum_versions;
create policy curriculum_versions_update on public.curriculum_versions
  for update to authenticated
  using (((organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2())
  with check (((organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2());

drop policy if exists curriculum_versions_delete on public.curriculum_versions;
create policy curriculum_versions_delete on public.curriculum_versions
  for delete to authenticated
  using (((organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2());

-- pathways, strands, sub_strands, subjects, topics all share the identical
-- original predicate: ((authoring_organization_id IS NULL) AND app_private.is_platform_admin())
do $$
declare t text;
begin
  foreach t in array array['pathways','strands','sub_strands','subjects','topics'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (((authoring_organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2())',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (((authoring_organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2())
         with check (((authoring_organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2())',
      t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (((authoring_organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2())',
      t || '_delete', t);
  end loop;
end $$;

drop policy if exists learning_outcomes_write on public.learning_outcomes;
create policy learning_outcomes_write on public.learning_outcomes
  for all to authenticated
  using (((authoring_organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2())
  with check (((authoring_organization_id is null) and app_private.is_platform_admin()) and app_private.has_aal2());

-- ---------------------------------------------------------------------
-- Lesson-scoped child rows (ownership branch preserved verbatim)
-- ---------------------------------------------------------------------
drop policy if exists learning_objectives_write on public.learning_objectives;
create policy learning_objectives_write on public.learning_objectives
  for all to authenticated
  using ((exists (
      select 1 from public.lessons l
      where l.id = learning_objectives.lesson_id
        and (((l.author_type = 'platform') and (l.authoring_organization_id is null) and app_private.is_platform_admin())
          or ((l.author_type = 'tenant') and app_private.can_author_curriculum(l.authoring_organization_id)))
    )) and app_private.has_aal2())
  with check ((exists (
      select 1 from public.lessons l
      where l.id = learning_objectives.lesson_id
        and (((l.author_type = 'platform') and (l.authoring_organization_id is null) and app_private.is_platform_admin())
          or ((l.author_type = 'tenant') and app_private.can_author_curriculum(l.authoring_organization_id)))
    )) and app_private.has_aal2());

drop policy if exists lesson_prerequisites_write on public.lesson_prerequisites;
create policy lesson_prerequisites_write on public.lesson_prerequisites
  for all to authenticated
  using ((exists (
      select 1 from public.lessons l
      where l.id = lesson_prerequisites.lesson_id
        and (((l.author_type = 'platform') and (l.authoring_organization_id is null) and app_private.is_platform_admin())
          or ((l.author_type = 'tenant') and app_private.can_author_curriculum(l.authoring_organization_id)))
    )) and app_private.has_aal2())
  with check ((exists (
      select 1 from public.lessons l
      where l.id = lesson_prerequisites.lesson_id
        and (((l.author_type = 'platform') and (l.authoring_organization_id is null) and app_private.is_platform_admin())
          or ((l.author_type = 'tenant') and app_private.can_author_curriculum(l.authoring_organization_id)))
    )) and app_private.has_aal2());

-- ---------------------------------------------------------------------
-- Mixed platform/tenant authoring (SEC-004 isolation + SEC-005 authoring
-- boundary preserved verbatim; can_author_curriculum is Organization
-- Administrator authority, so AAL2 is unconditional on both branches)
-- ---------------------------------------------------------------------
drop policy if exists lessons_insert on public.lessons;
create policy lessons_insert on public.lessons
  for insert to authenticated
  with check (((((author_type = 'platform') and (authoring_organization_id is null) and app_private.is_platform_admin())
     or ((author_type = 'tenant') and (authoring_organization_id is not null) and app_private.can_author_curriculum(authoring_organization_id)))) and app_private.has_aal2());

drop policy if exists lessons_update on public.lessons;
create policy lessons_update on public.lessons
  for update to authenticated
  using (((((author_type = 'platform') and (authoring_organization_id is null) and app_private.is_platform_admin())
     or ((author_type = 'tenant') and app_private.can_author_curriculum(authoring_organization_id)))) and app_private.has_aal2())
  with check (((((author_type = 'platform') and (authoring_organization_id is null) and app_private.is_platform_admin())
     or ((author_type = 'tenant') and (authoring_organization_id is not null) and app_private.can_author_curriculum(authoring_organization_id)))) and app_private.has_aal2());

drop policy if exists lessons_delete on public.lessons;
create policy lessons_delete on public.lessons
  for delete to authenticated
  using (((((author_type = 'platform') and (authoring_organization_id is null) and app_private.is_platform_admin())
     or ((author_type = 'tenant') and app_private.can_author_curriculum(authoring_organization_id)))) and app_private.has_aal2());

drop policy if exists curriculum_resources_write on public.curriculum_resources;
create policy curriculum_resources_write on public.curriculum_resources
  for all to authenticated
  using (((((organization_id is null) and app_private.is_platform_admin())
     or app_private.can_author_curriculum(organization_id))) and app_private.has_aal2())
  with check (((((organization_id is null) and app_private.is_platform_admin())
     or app_private.can_author_curriculum(organization_id))) and app_private.has_aal2());

-- ---------------------------------------------------------------------
-- Tenant administration (Org Admin / Platform Admin + AAL2).
-- Self-service branches (SEC-001/SEC-002 open-enrollment paths for ordinary
-- principals) are NOT given a mandatory-MFA rule: AAL2 is attached to the
-- administrative branch only.
-- ---------------------------------------------------------------------
drop policy if exists org_platform_admin_write on public.organizations;
create policy org_platform_admin_write on public.organizations
  for update to authenticated
  using ((app_private.is_platform_admin() or app_private.has_org_role(id, 'org_admin')) and app_private.has_aal2())
  with check ((app_private.is_platform_admin() or app_private.has_org_role(id, 'org_admin')) and app_private.has_aal2());

drop policy if exists membership_admin_update on public.organization_memberships;
create policy membership_admin_update on public.organization_memberships
  for update to authenticated
  using ((app_private.has_org_role(organization_id, 'org_admin') or app_private.is_platform_admin())
         and app_private.has_aal2());

drop policy if exists membership_self_join on public.organization_memberships;
create policy membership_self_join on public.organization_memberships
  for insert to authenticated
  with check (
    (((app_private.has_org_role(organization_id, 'org_admin') or app_private.is_platform_admin()))
       and app_private.has_aal2())
    or ((user_id = auth.uid()) and (status = 'active') and (created_by = auth.uid())
        and ((updated_by is null) or (updated_by = auth.uid()))
        and app_private.is_open_enrollment(organization_id))
  );

drop policy if exists user_role_update on public.user_roles;
create policy user_role_update on public.user_roles
  for update to authenticated
  using ((app_private.has_org_role(organization_id, 'org_admin') or app_private.is_platform_admin())
         and app_private.has_aal2());

drop policy if exists user_role_insert on public.user_roles;
create policy user_role_insert on public.user_roles
  for insert to authenticated
  with check (
    (((app_private.is_platform_admin() or app_private.has_org_role(organization_id, 'org_admin')))
       and app_private.has_aal2())
    or ((user_id = auth.uid()) and (status = 'active') and (created_by = auth.uid())
        and ((updated_by is null) or (updated_by = auth.uid()))
        and app_private.is_open_enrollment(organization_id)
        and (organization_id in (select app_private.auth_organization_ids()))
        and (exists (select 1 from public.roles r where r.id = user_roles.role_id and r.code = 'parent_guardian')))
  );

-- ---------------------------------------------------------------------
-- organization_security_settings: administrative write path, re-introduced
-- together with the matching grants (stage one deliberately left it read-only).
-- ---------------------------------------------------------------------
grant insert, update, delete on table public.organization_security_settings to authenticated;

drop policy if exists organization_security_settings_platform_admin_write
  on public.organization_security_settings;
create policy organization_security_settings_platform_admin_write
  on public.organization_security_settings
  for all to authenticated
  using (app_private.is_platform_admin() and app_private.has_aal2())
  with check (app_private.is_platform_admin() and app_private.has_aal2());

commit;

-- =====================================================================
-- ROLLBACK PROCEDURE
-- =====================================================================
-- Reversal is exact: re-create each policy above with its ORIGINAL predicate
-- (the text preserved verbatim inside each `and app_private.has_aal2()`
-- conjunction), revoke the organization_security_settings write grants, drop
-- app_private.org_mfa_satisfied() and app_private.org_requires_mfa(), and set
-- MFA_ENFORCEMENT_ENABLED back to false in the same release. No data is
-- created, altered or deleted by this migration, so rollback is lossless.
