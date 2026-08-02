create or replace function app_private.is_student_creator(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and s.created_by = auth.uid()
  );
$$;

create or replace function app_private.is_full_management_guardian(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.parent_student_relationships r
    where r.student_id = p_student_id
      and r.parent_id = auth.uid()
      and r.status = 'active'
      and r.permission_level = 'full_management'
  );
$$;

grant execute on function app_private.is_student_creator(uuid) to authenticated, service_role;
grant execute on function app_private.is_full_management_guardian(uuid) to authenticated, service_role;

drop policy if exists psr_insert on public.parent_student_relationships;

create policy psr_insert
on public.parent_student_relationships
for insert
to authenticated
with check (
  created_by = auth.uid()
  and organization_id in (select app_private.auth_organization_ids())
  and (
    app_private.has_org_role(organization_id, 'org_admin')
    or app_private.is_student_creator(student_id)
    or app_private.is_full_management_guardian(student_id)
  )
);