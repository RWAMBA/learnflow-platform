drop policy if exists students_tenant_isolation on public.students;

create policy students_tenant_isolation
on public.students
for select
to authenticated
using (
  created_by = auth.uid()
  or app_private.has_org_role(organization_id, 'org_admin')
  or app_private.can_view_student(id)
);