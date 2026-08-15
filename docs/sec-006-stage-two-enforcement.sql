-- =====================================================================
-- SEC-006 STAGE TWO — AUTHORITATIVE AAL2 ENFORCEMENT (PREPARED, NOT APPLIED)
-- =====================================================================
-- This file is deliberately NOT in supabase/migrations/. It becomes a
-- timestamped migration ONLY after all four of the following are true:
--
--   1. Claude architecture/security review of this security branch is complete.
--   2. Independent security/release approval is recorded.
--   3. The security code on this branch is merged and deployed from `main`.
--   4. The administrator-readiness preflight in section 0 passes at
--      deployment time (aggregates only — never identities).
--
-- No administrator counts are hard-coded anywhere in this file. Readiness is
-- evaluated at deployment time by the aggregate queries in section 0 and
-- re-asserted transactionally by the fail-closed guard in section 1.
--
-- Every policy below preserves its ORIGINAL SEC-001..SEC-005 predicate
-- verbatim (copied from the live catalog) and adds AAL2 only as an additional
-- conjunct. MFA never grants a permission the principal did not already hold.
-- Open-enrollment/self-service branches, Parent/Guardian branches and Student
-- branches are NOT modified.
--
-- Teacher/Tutor: see section 4. SEC-005 removed Teacher/Tutor curriculum
-- authoring authority; no current RLS write policy authorizes Teacher or Tutor
-- on any surface in scope of this migration. No conditional Teacher/Tutor MFA
-- helper is therefore created — an unused helper must never be presented as
-- active enforcement.
--
-- Apply the forward section and set MFA_ENFORCEMENT_ENABLED = true in
-- src/features/security/mfa.ts in the SAME release.
-- =====================================================================


-- =====================================================================
-- SECTION 0 — DEPLOYMENT PREREQUISITE CHECKS (READ ONLY, AGGREGATES ONLY)
-- ---------------------------------------------------------------------
-- Run these BEFORE the forward transaction. They return counts only; no
-- user id, email, factor id or other identity is selected. All three
-- expressions must be true.
-- =====================================================================

-- 0.1 Platform Administrator readiness.
select
  count(*) filter (where pa.status = 'active')                      as active_platform_admins,
  count(*) filter (where pa.status = 'active' and f.verified)       as active_platform_admins_with_verified_factor,
  (count(*) filter (where pa.status = 'active') >= 2)
    and (count(*) filter (where pa.status = 'active')
         = count(*) filter (where pa.status = 'active' and f.verified)) as platform_admin_gate_pass
from public.platform_admins pa
left join lateral (
  select true as verified
  from auth.mfa_factors mf
  where mf.user_id = pa.user_id
    and mf.status = 'verified'
  limit 1
) f on true;

-- 0.2 Organization Administrator readiness. Administrators without a verified
-- factor are not locked out of the product: the application keeps them on the
-- enrollment-only surface (/account/mfa) until they enrol. The gate passes when
-- either every active Organization Administrator holds a verified factor, or
-- the enrollment-only transition is confirmed available (MFA_ENFORCEMENT_ENABLED
-- shipping true in the same release, which routes them to enrollment).
select
  count(*)                                        as active_org_admins,
  count(*) filter (where f.verified)              as active_org_admins_with_verified_factor,
  count(*) - count(*) filter (where f.verified)   as active_org_admins_pending_enrollment
from public.user_roles ur
join public.roles r on r.id = ur.role_id and r.code = 'org_admin'
join public.organization_memberships om
  on om.user_id = ur.user_id and om.organization_id = ur.organization_id
left join lateral (
  select true as verified
  from auth.mfa_factors mf
  where mf.user_id = ur.user_id and mf.status = 'verified'
  limit 1
) f on true
where ur.status = 'active' and om.status = 'active';

-- 0.3 Teacher/Tutor write-surface check: must return 0. A non-zero result means
-- a Teacher/Tutor mutation surface has been introduced since this file was
-- written and section 4 must be revisited before applying.
select count(*) as teacher_tutor_write_policies
from pg_policies
where schemaname = 'public'
  and cmd <> 'SELECT'
  and tablename in (
    'curricula','grades','curriculum_versions','pathways','subjects','strands',
    'sub_strands','topics','learning_outcomes','learning_objectives',
    'lesson_prerequisites','competencies','lessons','curriculum_resources',
    'organizations','organization_memberships','user_roles',
    'organization_security_settings')
  and (coalesce(qual,'') || coalesce(with_check,'')) ~* '(teacher|tutor)';


-- =====================================================================
-- >>> FORWARD SQL BEGIN
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- SECTION 1 — Fail-closed transactional readiness guard (aggregates only)
-- ---------------------------------------------------------------------
do $$
declare
  v_admins int;
  v_admins_ok int;
  v_org_pending int;
  v_tt int;
begin
  select count(*) filter (where pa.status = 'active'),
         count(*) filter (where pa.status = 'active' and f.verified)
    into v_admins, v_admins_ok
  from public.platform_admins pa
  left join lateral (
    select true as verified from auth.mfa_factors mf
    where mf.user_id = pa.user_id and mf.status = 'verified' limit 1
  ) f on true;

  if v_admins < 2 or v_admins <> v_admins_ok then
    raise exception
      'SEC-006 stage two aborted: platform administrator readiness failed (active=%, with verified factor=%)',
      v_admins, v_admins_ok;
  end if;

  select count(*) - count(*) filter (where f.verified) into v_org_pending
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id and r.code = 'org_admin'
  join public.organization_memberships om
    on om.user_id = ur.user_id and om.organization_id = ur.organization_id
  left join lateral (
    select true as verified from auth.mfa_factors mf
    where mf.user_id = ur.user_id and mf.status = 'verified' limit 1
  ) f on true
  where ur.status = 'active' and om.status = 'active';

  raise notice 'SEC-006 stage two: organization administrators pending enrollment = %', v_org_pending;

  select count(*) into v_tt
  from pg_policies
  where schemaname = 'public'
    and cmd <> 'SELECT'
    and tablename in (
      'curricula','grades','curriculum_versions','pathways','subjects','strands',
      'sub_strands','topics','learning_outcomes','learning_objectives',
      'lesson_prerequisites','competencies','lessons','curriculum_resources',
      'organizations','organization_memberships','user_roles',
      'organization_security_settings')
    and (coalesce(qual,'') || coalesce(with_check,'')) ~* '(teacher|tutor)';

  if v_tt <> 0 then
    raise exception
      'SEC-006 stage two aborted: % Teacher/Tutor write policies exist on in-scope tables; section 4 must be revisited',
      v_tt;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- SECTION 2 — Helpers
-- ---------------------------------------------------------------------
-- app_private.has_aal2() already exists (migration 20260814230011) and fails
-- closed on missing/null/malformed/non-string aal claims. No new helper is
-- created by this migration.

-- ---------------------------------------------------------------------
-- SECTION 3 — Platform-owned structural curriculum writes
--             (Platform Administrator + AAL2, unconditional)
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
-- SECTION 4 — Teacher/Tutor conditional MFA: DELIBERATELY NOT IMPLEMENTED
-- ---------------------------------------------------------------------
-- Verified against the live catalog at preparation time:
--   * app_private.can_author_curriculum(uuid) resolves to
--     `p_org_id is not null and app_private.has_org_role(p_org_id,'org_admin')`
--     — Organization Administrator authority only (SEC-005).
--   * No write (INSERT/UPDATE/DELETE/ALL) policy on any table in scope of this
--     migration references a Teacher or Tutor role or relationship.
-- Therefore the previously drafted app_private.org_requires_mfa() /
-- app_private.org_mfa_satisfied() helpers had no policy to attach to and have
-- been REMOVED from this file. Shipping them would misrepresent an unused
-- function as active RLS enforcement.
--
-- The organization_security_settings columns teacher_mfa_required /
-- tutor_mfa_required remain the policy-storage surface, and the implemented
-- role-aware route guard (readMandatoryMfa() + src/routes/_authenticated/route.tsx)
-- is PRESERVED and continues to honour them for UI-level step-up.
--
-- REQUIREMENT CARRIED FORWARD: any future change that grants Teacher or Tutor a
-- mutation surface (for example Phase 10 tenant lesson co-authoring) MUST, in
-- the same change, add authoritative conditional enforcement to that exact
-- policy branch:
--     and (
--       not <organization requires MFA for that role>
--       or app_private.has_aal2()
--     )
-- together with policy-off / policy-on allow-and-deny tests. Section 0.3 and
-- the section 1 guard fail closed if such a surface appears before that work
-- is done.

-- ---------------------------------------------------------------------
-- SECTION 5 — Lesson-scoped child rows (ownership branch preserved verbatim)
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
-- SECTION 6 — Mixed platform/tenant authoring (SEC-004 isolation + SEC-005
-- authoring boundary preserved verbatim; can_author_curriculum is Organization
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
-- SECTION 7 — Tenant administration (Org Admin / Platform Admin + AAL2).
-- Self-service branches (SEC-001/SEC-002 open-enrollment paths for ordinary
-- principals) are NOT given a mandatory-MFA rule: AAL2 is attached to the
-- administrative branch only. Parent/Guardian and Student branches unchanged.
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
-- SECTION 8 — organization_security_settings: administrative write path,
-- re-introduced together with the matching grants (stage one deliberately
-- left it read-only). Read policy is untouched.
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
-- <<< FORWARD SQL END
-- =====================================================================


-- =====================================================================
-- >>> ROLLBACK SQL BEGIN
-- ---------------------------------------------------------------------
-- Complete, executable reversal. Every policy is re-created with its ORIGINAL
-- pre-stage-two predicate exactly as recorded in the live catalog. Helper state
-- is restored (no helper was created by the forward section; the previously
-- drafted org_requires_mfa/org_mfa_satisfied helpers are dropped defensively in
-- case an earlier draft was ever applied). No DML, no data loss.
-- Set MFA_ENFORCEMENT_ENABLED back to false in the same release.
-- =====================================================================
begin;

-- Section 8 reversal ---------------------------------------------------
drop policy if exists organization_security_settings_platform_admin_write
  on public.organization_security_settings;
revoke insert, update, delete on table public.organization_security_settings from authenticated;

-- Section 7 reversal ---------------------------------------------------
drop policy if exists org_platform_admin_write on public.organizations;
create policy org_platform_admin_write on public.organizations
  for update to authenticated
  using (app_private.is_platform_admin() or app_private.has_org_role(id, 'org_admin'))
  with check (app_private.is_platform_admin() or app_private.has_org_role(id, 'org_admin'));

drop policy if exists membership_admin_update on public.organization_memberships;
create policy membership_admin_update on public.organization_memberships
  for update to authenticated
  using (app_private.has_org_role(organization_id, 'org_admin') or app_private.is_platform_admin());

drop policy if exists membership_self_join on public.organization_memberships;
create policy membership_self_join on public.organization_memberships
  for insert to authenticated
  with check (
    app_private.has_org_role(organization_id, 'org_admin')
    or app_private.is_platform_admin()
    or ((user_id = auth.uid()) and (status = 'active') and (created_by = auth.uid())
        and ((updated_by is null) or (updated_by = auth.uid()))
        and app_private.is_open_enrollment(organization_id))
  );

drop policy if exists user_role_update on public.user_roles;
create policy user_role_update on public.user_roles
  for update to authenticated
  using (app_private.has_org_role(organization_id, 'org_admin') or app_private.is_platform_admin());

drop policy if exists user_role_insert on public.user_roles;
create policy user_role_insert on public.user_roles
  for insert to authenticated
  with check (
    app_private.is_platform_admin()
    or app_private.has_org_role(organization_id, 'org_admin')
    or ((user_id = auth.uid()) and (status = 'active') and (created_by = auth.uid())
        and ((updated_by is null) or (updated_by = auth.uid()))
        and app_private.is_open_enrollment(organization_id)
        and (organization_id in (select app_private.auth_organization_ids()))
        and (exists (select 1 from public.roles r where r.id = user_roles.role_id and r.code = 'parent_guardian')))
  );

-- Section 6 reversal ---------------------------------------------------
drop policy if exists lessons_insert on public.lessons;
create policy lessons_insert on public.lessons
  for insert to authenticated
  with check (((author_type = 'platform') and (authoring_organization_id is null) and app_private.is_platform_admin())
     or ((author_type = 'tenant') and (authoring_organization_id is not null) and app_private.can_author_curriculum(authoring_organization_id)));

drop policy if exists lessons_update on public.lessons;
create policy lessons_update on public.lessons
  for update to authenticated
  using (((author_type = 'platform') and (authoring_organization_id is null) and app_private.is_platform_admin())
     or ((author_type = 'tenant') and app_private.can_author_curriculum(authoring_organization_id)))
  with check (((author_type = 'platform') and (authoring_organization_id is null) and app_private.is_platform_admin())
     or ((author_type = 'tenant') and (authoring_organization_id is not null) and app_private.can_author_curriculum(authoring_organization_id)));

drop policy if exists lessons_delete on public.lessons;
create policy lessons_delete on public.lessons
  for delete to authenticated
  using (((author_type = 'platform') and (authoring_organization_id is null) and app_private.is_platform_admin())
     or ((author_type = 'tenant') and app_private.can_author_curriculum(authoring_organization_id)));

drop policy if exists curriculum_resources_write on public.curriculum_resources;
create policy curriculum_resources_write on public.curriculum_resources
  for all to authenticated
  using (((organization_id is null) and app_private.is_platform_admin())
     or app_private.can_author_curriculum(organization_id))
  with check (((organization_id is null) and app_private.is_platform_admin())
     or app_private.can_author_curriculum(organization_id));

-- Section 5 reversal ---------------------------------------------------
drop policy if exists learning_objectives_write on public.learning_objectives;
create policy learning_objectives_write on public.learning_objectives
  for all to authenticated
  using (exists (
      select 1 from public.lessons l
      where l.id = learning_objectives.lesson_id
        and (((l.author_type = 'platform') and (l.authoring_organization_id is null) and app_private.is_platform_admin())
          or ((l.author_type = 'tenant') and app_private.can_author_curriculum(l.authoring_organization_id)))
    ))
  with check (exists (
      select 1 from public.lessons l
      where l.id = learning_objectives.lesson_id
        and (((l.author_type = 'platform') and (l.authoring_organization_id is null) and app_private.is_platform_admin())
          or ((l.author_type = 'tenant') and app_private.can_author_curriculum(l.authoring_organization_id)))
    ));

drop policy if exists lesson_prerequisites_write on public.lesson_prerequisites;
create policy lesson_prerequisites_write on public.lesson_prerequisites
  for all to authenticated
  using (exists (
      select 1 from public.lessons l
      where l.id = lesson_prerequisites.lesson_id
        and (((l.author_type = 'platform') and (l.authoring_organization_id is null) and app_private.is_platform_admin())
          or ((l.author_type = 'tenant') and app_private.can_author_curriculum(l.authoring_organization_id)))
    ))
  with check (exists (
      select 1 from public.lessons l
      where l.id = lesson_prerequisites.lesson_id
        and (((l.author_type = 'platform') and (l.authoring_organization_id is null) and app_private.is_platform_admin())
          or ((l.author_type = 'tenant') and app_private.can_author_curriculum(l.authoring_organization_id)))
    ));

-- Section 3 reversal ---------------------------------------------------
drop policy if exists learning_outcomes_write on public.learning_outcomes;
create policy learning_outcomes_write on public.learning_outcomes
  for all to authenticated
  using ((authoring_organization_id is null) and app_private.is_platform_admin())
  with check ((authoring_organization_id is null) and app_private.is_platform_admin());

do $$
declare t text;
begin
  foreach t in array array['pathways','strands','sub_strands','subjects','topics'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((authoring_organization_id is null) and app_private.is_platform_admin())',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((authoring_organization_id is null) and app_private.is_platform_admin())
         with check ((authoring_organization_id is null) and app_private.is_platform_admin())',
      t || '_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using ((authoring_organization_id is null) and app_private.is_platform_admin())',
      t || '_delete', t);
  end loop;
end $$;

drop policy if exists curriculum_versions_insert on public.curriculum_versions;
create policy curriculum_versions_insert on public.curriculum_versions
  for insert to authenticated
  with check ((organization_id is null) and app_private.is_platform_admin());

drop policy if exists curriculum_versions_update on public.curriculum_versions;
create policy curriculum_versions_update on public.curriculum_versions
  for update to authenticated
  using ((organization_id is null) and app_private.is_platform_admin())
  with check ((organization_id is null) and app_private.is_platform_admin());

drop policy if exists curriculum_versions_delete on public.curriculum_versions;
create policy curriculum_versions_delete on public.curriculum_versions
  for delete to authenticated
  using ((organization_id is null) and app_private.is_platform_admin());

-- Helper state restoration --------------------------------------------
-- app_private.has_aal2() predates stage two and is intentionally retained.
drop function if exists app_private.org_mfa_satisfied(uuid, text);
drop function if exists app_private.org_requires_mfa(uuid, text);

commit;
-- =====================================================================
-- <<< ROLLBACK SQL END
-- rollback is lossless
-- =====================================================================
