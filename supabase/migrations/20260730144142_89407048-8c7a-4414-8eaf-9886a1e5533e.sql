-- ===== IDENTITY =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  locale text not null default 'en',
  timezone text not null default 'Africa/Nairobi',
  theme_preference text not null default 'system' check (theme_preference in ('system','light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id)
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;

-- ===== MEMBERSHIP & ROLE ASSIGNMENT =====
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tenant_type text not null check (tenant_type in
    ('family','independent_tutor','private_school','homeschool_academy','learning_centre','ngo')),
  default_curriculum_id uuid,
  default_locale text not null default 'en',
  default_currency text not null default 'KES',
  timezone text not null default 'Africa/Nairobi',
  younger_student_independent_login boolean not null default false,
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, update on public.organizations to authenticated;
grant all on public.organizations to service_role;

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','suspended','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  unique (user_id, organization_id)
);
grant select, insert, update on public.organization_memberships to authenticated;
grant all on public.organization_memberships to service_role;

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);
grant select on public.roles to authenticated;
grant all on public.roles to service_role;

insert into public.roles (code, name) values
  ('student', 'Student'),
  ('parent_guardian', 'Parent/Guardian'),
  ('teacher', 'Teacher'),
  ('tutor', 'Tutor'),
  ('org_admin', 'Organization Administrator');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id),
  status text not null default 'active' check (status in ('active','suspended','ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (user_id, organization_id) references public.organization_memberships(user_id, organization_id),
  unique (user_id, organization_id, role_id)
);
grant select, insert, update on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

-- ===== PLATFORM CONFIGURATION =====
create table public.system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
grant select on public.system_settings to authenticated;
grant all on public.system_settings to service_role;

insert into public.system_settings (key, value, description) values
  ('relationship_invitation_expiry_days', '14', 'Days before a pending relationship invitation expires');

-- ===== CONTENT SPINE =====
create table public.curricula (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.curricula to authenticated;
grant all on public.curricula to service_role;

alter table public.organizations
  add constraint organizations_default_curriculum_fk
  foreign key (default_curriculum_id) references public.curricula(id);

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.curricula(id) on delete cascade,
  name text not null,
  sequence_order int not null,
  pathway_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (curriculum_id, sequence_order)
);
grant select on public.grades to authenticated;
grant all on public.grades to service_role;

create table public.pathways (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grades(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
grant select on public.pathways to authenticated;
grant all on public.pathways to service_role;

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.grades(id) on delete cascade,
  pathway_id uuid references public.pathways(id),
  name text not null,
  code text,
  created_at timestamptz not null default now()
);
grant select on public.subjects to authenticated;
grant all on public.subjects to service_role;

create table public.competencies (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
grant select on public.competencies to authenticated;
grant all on public.competencies to service_role;

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  sequence_order int not null,
  content_type text not null check (content_type in ('text','structured_unit','media')),
  content_body jsonb,
  storage_path text,
  author_type text not null default 'platform' check (author_type in ('platform','tenant','licensed')),
  authoring_organization_id uuid references public.organizations(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.lessons to authenticated;
grant all on public.lessons to service_role;

-- ===== STUDENT & LEARNING =====
create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_role_id uuid unique references public.user_roles(id),
  created_by uuid not null references public.profiles(id),
  first_name text not null,
  last_name text not null,
  date_of_birth date,
  grade_id uuid references public.grades(id),
  pathway_id uuid references public.pathways(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.students to authenticated;
grant all on public.students to service_role;

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id),
  student_id uuid not null references public.students(id) on delete cascade,
  created_by_user_role_id uuid not null references public.user_roles(id),
  due_at timestamptz,
  status text not null default 'not_started'
    check (status in ('not_started','in_progress','submitted','graded','overdue')),
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.assignments to authenticated;
grant all on public.assignments to service_role;

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  graded_by_user_role_id uuid references public.user_roles(id),
  result jsonb not null default '{}'::jsonb,
  graded_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert on public.assessments to authenticated;
grant all on public.assessments to service_role;

create table public.progress_records (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  competency_id uuid not null references public.competencies(id),
  assessment_id uuid references public.assessments(id),
  mastery_level text not null check (mastery_level in ('emerging','developing','proficient','advanced')),
  recorded_at timestamptz not null default now()
);
grant select, insert on public.progress_records to authenticated;
grant all on public.progress_records to service_role;

-- ===== RELATIONSHIPS =====
create table public.parent_student_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid not null references public.profiles(id),
  student_id uuid not null references public.students(id) on delete cascade,
  role_subtype text not null
    check (role_subtype in ('biological_parent','legal_guardian','foster_parent','other_guardian')),
  permission_level text not null check (permission_level in ('full_management','view_only')),
  status text not null default 'pending_invitation'
    check (status in ('pending_invitation','active','suspended','ended','declined','expired')),
  invitation_status text not null default 'sent' check (invitation_status in ('sent','accepted','declined','expired')),
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  audit_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (parent_id, organization_id) references public.organization_memberships(user_id, organization_id),
  unique (parent_id, student_id)
);
grant select, insert, update on public.parent_student_relationships to authenticated;
grant all on public.parent_student_relationships to service_role;

create table public.teacher_student_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid references public.subjects(id),
  status text not null default 'pending_invitation'
    check (status in ('pending_invitation','active','suspended','ended','declined','expired')),
  invitation_status text not null default 'sent' check (invitation_status in ('sent','accepted','declined','expired')),
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (teacher_id, organization_id) references public.organization_memberships(user_id, organization_id),
  unique (teacher_id, student_id, subject_id)
);
grant select, insert, update on public.teacher_student_relationships to authenticated;
grant all on public.teacher_student_relationships to service_role;

create table public.tutor_student_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tutor_id uuid not null references public.profiles(id),
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid references public.subjects(id),
  status text not null default 'pending_invitation'
    check (status in ('pending_invitation','active','suspended','ended','declined','expired')),
  invitation_status text not null default 'sent' check (invitation_status in ('sent','accepted','declined','expired')),
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  updated_by uuid references public.profiles(id),
  foreign key (tutor_id, organization_id) references public.organization_memberships(user_id, organization_id),
  unique (tutor_id, student_id, subject_id)
);
grant select, insert, update on public.tutor_student_relationships to authenticated;
grant all on public.tutor_student_relationships to service_role;

create or replace function public.set_audit_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger trg_psr_audit before update on public.parent_student_relationships
  for each row execute function public.set_audit_fields();
create trigger trg_tsr_audit before update on public.teacher_student_relationships
  for each row execute function public.set_audit_fields();
create trigger trg_tutsr_audit before update on public.tutor_student_relationships
  for each row execute function public.set_audit_fields();
create trigger trg_om_audit before update on public.organization_memberships
  for each row execute function public.set_audit_fields();
create trigger trg_ur_audit before update on public.user_roles
  for each row execute function public.set_audit_fields();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_org_updated before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger trg_students_updated before update on public.students
  for each row execute function public.set_updated_at();
create trigger trg_assignments_updated before update on public.assignments
  for each row execute function public.set_updated_at();

-- ===== COMMUNICATION =====
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select, insert on public.conversations to authenticated;
grant all on public.conversations to service_role;

create table public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_role_id uuid not null references public.user_roles(id),
  joined_at timestamptz not null default now(),
  unique (conversation_id, user_role_id)
);
grant select, insert on public.conversation_participants to authenticated;
grant all on public.conversation_participants to service_role;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_role_id uuid not null references public.user_roles(id),
  body text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);
grant select, insert, update on public.messages to authenticated;
grant all on public.messages to service_role;

-- ===== SUBSCRIPTION =====
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  eligible_tenant_types text[] not null,
  entitlements jsonb not null default '{}'::jsonb,
  price_amount numeric(10,2),
  price_currency text not null default 'KES',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.plans to authenticated;
grant all on public.plans to service_role;

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  status text not null default 'trial' check (status in ('trial','manual','active','ended')),
  assigned_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.organization_subscriptions to authenticated;
grant all on public.organization_subscriptions to service_role;

-- ===== NOTIFICATIONS, AUDIT & SECURITY EVENTS =====
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_role_id uuid not null references public.user_roles(id),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in
    ('failed_login','account_lockout','suspicious_invitation_activity',
     'excessive_password_reset_requests','other')),
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  actor_user_id uuid references public.profiles(id),
  organization_id uuid references public.organizations(id),
  ip_address inet,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
grant select on public.security_events to authenticated;
grant all on public.security_events to service_role;

-- ===== INDEXES =====
create index idx_psr_org_student on public.parent_student_relationships (organization_id, student_id, status);
create index idx_psr_parent on public.parent_student_relationships (parent_id, status);
create index idx_tsr_org_student on public.teacher_student_relationships (organization_id, student_id, status);
create index idx_tsr_teacher on public.teacher_student_relationships (teacher_id, status);
create index idx_tutsr_org_student on public.tutor_student_relationships (organization_id, student_id, status);
create index idx_tutsr_tutor on public.tutor_student_relationships (tutor_id, status);
create index idx_om_org_user on public.organization_memberships (organization_id, user_id);
create index idx_ur_org_user_role on public.user_roles (organization_id, user_id, role_id);
create index idx_assignments_student_status on public.assignments (student_id, status, due_at);
create index idx_progress_student_competency on public.progress_records (student_id, competency_id);
create index idx_messages_conversation_sent on public.messages (conversation_id, sent_at);
create index idx_audit_org_created on public.audit_logs (organization_id, created_at);
create index idx_security_events_type_created on public.security_events (event_type, created_at);
create index idx_security_events_org_created on public.security_events (organization_id, created_at);
create index idx_students_org on public.students (organization_id);
create index idx_lessons_subject on public.lessons (subject_id, sequence_order);
create index idx_subjects_grade on public.subjects (grade_id);
create index idx_notifications_recipient on public.notifications (recipient_user_role_id, read_at);

-- ===== RLS HELPER FUNCTIONS =====
create or replace function public.auth_organization_ids()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select om.organization_id
  from public.organization_memberships om
  where om.user_id = auth.uid() and om.status = 'active';
$$;

create or replace function public.auth_user_role_ids(p_role_code text default null)
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select ur.id
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = auth.uid()
    and ur.status = 'active'
    and (p_role_code is null or r.code = p_role_code);
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.has_org_role(p_org_id uuid, p_role_code text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and ur.status = 'active'
      and ur.organization_id = p_org_id and r.code = p_role_code
  );
$$;

create or replace function public.can_manage_student(p_student_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and (s.created_by = auth.uid() or public.has_org_role(s.organization_id, 'org_admin'))
  )
  or exists (
    select 1 from public.parent_student_relationships r
    where r.student_id = p_student_id and r.status = 'active'
      and r.permission_level = 'full_management' and r.parent_id = auth.uid()
  );
$$;

create or replace function public.can_view_student(p_student_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.students s
                 where s.id = p_student_id
                   and s.organization_id in (select public.auth_organization_ids()))
     or public.is_platform_admin();
$$;

-- ===== RLS POLICIES =====
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles
  for select to authenticated using (
    id = auth.uid()
    or exists (select 1 from public.organization_memberships om
               where om.user_id = profiles.id
                 and om.organization_id in (select public.auth_organization_ids()))
    or public.is_platform_admin()
  );
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.platform_admins enable row level security;
create policy platform_admins_select on public.platform_admins
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());

alter table public.organizations enable row level security;
create policy org_isolation_select on public.organizations
  for select to authenticated using (id in (select public.auth_organization_ids()) or public.is_platform_admin());
create policy org_platform_admin_write on public.organizations
  for update to authenticated using (public.is_platform_admin() or public.has_org_role(id, 'org_admin'))
  with check (public.is_platform_admin() or public.has_org_role(id, 'org_admin'));

alter table public.organization_memberships enable row level security;
create policy membership_visibility on public.organization_memberships
  for select to authenticated using (
    user_id = auth.uid() or organization_id in (select public.auth_organization_ids()) or public.is_platform_admin()
  );
create policy membership_self_join on public.organization_memberships
  for insert to authenticated with check (user_id = auth.uid() or public.has_org_role(organization_id, 'org_admin'));
create policy membership_admin_update on public.organization_memberships
  for update to authenticated using (public.has_org_role(organization_id, 'org_admin') or public.is_platform_admin());

alter table public.user_roles enable row level security;
create policy user_role_visibility on public.user_roles
  for select to authenticated using (
    user_id = auth.uid() or organization_id in (select public.auth_organization_ids()) or public.is_platform_admin()
  );
create policy user_role_insert on public.user_roles
  for insert to authenticated with check (
    user_id = auth.uid() or public.has_org_role(organization_id, 'org_admin')
  );
create policy user_role_update on public.user_roles
  for update to authenticated using (public.has_org_role(organization_id, 'org_admin') or public.is_platform_admin());

alter table public.roles enable row level security;
create policy roles_select on public.roles for select to authenticated using (true);

alter table public.system_settings enable row level security;
create policy system_settings_select on public.system_settings for select to authenticated using (true);

alter table public.curricula enable row level security;
create policy curricula_select on public.curricula for select to authenticated using (true);

alter table public.grades enable row level security;
create policy grades_select on public.grades for select to authenticated using (true);

alter table public.pathways enable row level security;
create policy pathways_select on public.pathways for select to authenticated using (true);

alter table public.subjects enable row level security;
create policy subjects_select on public.subjects for select to authenticated using (true);

alter table public.competencies enable row level security;
create policy competencies_select on public.competencies for select to authenticated using (true);

alter table public.lessons enable row level security;
create policy lessons_select on public.lessons for select to authenticated using (true);

alter table public.students enable row level security;
create policy students_tenant_isolation on public.students
  for select to authenticated using (organization_id in (select public.auth_organization_ids()) or public.is_platform_admin());
create policy students_insert on public.students
  for insert to authenticated with check (
    created_by = auth.uid()
    and organization_id in (select public.auth_organization_ids())
    and (public.has_org_role(organization_id, 'parent_guardian') or public.has_org_role(organization_id, 'org_admin'))
  );
create policy students_update on public.students
  for update to authenticated using (public.can_manage_student(id)) with check (public.can_manage_student(id));

alter table public.assignments enable row level security;
create policy assignments_select on public.assignments
  for select to authenticated using (public.can_view_student(student_id));
create policy assignments_insert on public.assignments
  for insert to authenticated with check (
    created_by_user_role_id in (select public.auth_user_role_ids())
    and (
      exists (select 1 from public.teacher_student_relationships r
              where r.student_id = assignments.student_id and r.status = 'active' and r.teacher_id = auth.uid())
      or exists (select 1 from public.tutor_student_relationships r
                 where r.student_id = assignments.student_id and r.status = 'active' and r.tutor_id = auth.uid())
      or exists (select 1 from public.parent_student_relationships r
                 where r.student_id = assignments.student_id and r.status = 'active' and r.parent_id = auth.uid())
      or exists (select 1 from public.user_roles ur join public.roles ro on ro.id = ur.role_id
                 where ur.id = assignments.created_by_user_role_id and ro.code = 'org_admin'
                   and ur.organization_id = (select organization_id from public.students where id = assignments.student_id))
    )
  );
create policy assignments_update on public.assignments
  for update to authenticated using (
    public.can_view_student(student_id)
    and (
      created_by_user_role_id in (select public.auth_user_role_ids())
      or exists (select 1 from public.students s where s.id = assignments.student_id
                   and s.user_role_id in (select public.auth_user_role_ids()))
      or exists (select 1 from public.teacher_student_relationships r
                 where r.student_id = assignments.student_id and r.status = 'active' and r.teacher_id = auth.uid())
      or exists (select 1 from public.tutor_student_relationships r
                 where r.student_id = assignments.student_id and r.status = 'active' and r.tutor_id = auth.uid())
      or exists (select 1 from public.parent_student_relationships r
                 where r.student_id = assignments.student_id and r.status = 'active' and r.parent_id = auth.uid())
      or public.has_org_role((select organization_id from public.students where id = assignments.student_id), 'org_admin')
    )
  );

alter table public.assessments enable row level security;
create policy assessments_select on public.assessments
  for select to authenticated using (
    exists (select 1 from public.assignments a where a.id = assessments.assignment_id
              and public.can_view_student(a.student_id))
  );
create policy assessments_insert on public.assessments
  for insert to authenticated with check (
    graded_by_user_role_id in (select public.auth_user_role_ids())
    and exists (
      select 1 from public.assignments a where a.id = assessments.assignment_id
        and (
          exists (select 1 from public.teacher_student_relationships r
                  where r.student_id = a.student_id and r.status = 'active' and r.teacher_id = auth.uid())
          or exists (select 1 from public.tutor_student_relationships r
                     where r.student_id = a.student_id and r.status = 'active' and r.tutor_id = auth.uid())
          or exists (select 1 from public.parent_student_relationships r
                     where r.student_id = a.student_id and r.status = 'active'
                       and r.permission_level = 'full_management' and r.parent_id = auth.uid())
          or public.has_org_role((select organization_id from public.students where id = a.student_id), 'org_admin')
        )
    )
  );

alter table public.progress_records enable row level security;
create policy progress_select on public.progress_records
  for select to authenticated using (public.can_view_student(student_id));
create policy progress_insert on public.progress_records
  for insert to authenticated with check (
    exists (select 1 from public.teacher_student_relationships r
            where r.student_id = progress_records.student_id and r.status = 'active' and r.teacher_id = auth.uid())
    or exists (select 1 from public.tutor_student_relationships r
               where r.student_id = progress_records.student_id and r.status = 'active' and r.tutor_id = auth.uid())
    or public.can_manage_student(student_id)
  );

alter table public.parent_student_relationships enable row level security;
create policy psr_select on public.parent_student_relationships
  for select to authenticated using (
    parent_id = auth.uid() or organization_id in (select public.auth_organization_ids()) or public.is_platform_admin()
  );
create policy psr_insert on public.parent_student_relationships
  for insert to authenticated with check (
    created_by = auth.uid()
    and organization_id in (select public.auth_organization_ids())
    and (
      public.has_org_role(organization_id, 'org_admin')
      or auth.uid() = (select created_by from public.students where id = student_id)
      or exists (select 1 from public.parent_student_relationships r
                 where r.student_id = parent_student_relationships.student_id and r.status = 'active'
                   and r.permission_level = 'full_management' and r.parent_id = auth.uid())
    )
  );
create policy psr_update on public.parent_student_relationships
  for update to authenticated using (parent_id = auth.uid() or public.can_manage_student(student_id));

alter table public.teacher_student_relationships enable row level security;
create policy tsr_select on public.teacher_student_relationships
  for select to authenticated using (
    teacher_id = auth.uid() or organization_id in (select public.auth_organization_ids()) or public.is_platform_admin()
  );
create policy tsr_insert on public.teacher_student_relationships
  for insert to authenticated with check (
    created_by = auth.uid()
    and organization_id in (select public.auth_organization_ids())
    and (
      public.has_org_role(organization_id, 'org_admin')
      or exists (select 1 from public.parent_student_relationships r
                 where r.student_id = teacher_student_relationships.student_id and r.status = 'active'
                   and r.permission_level = 'full_management' and r.parent_id = auth.uid())
    )
  );
create policy tsr_update on public.teacher_student_relationships
  for update to authenticated using (teacher_id = auth.uid() or public.can_manage_student(student_id));

alter table public.tutor_student_relationships enable row level security;
create policy tutsr_select on public.tutor_student_relationships
  for select to authenticated using (
    tutor_id = auth.uid() or organization_id in (select public.auth_organization_ids()) or public.is_platform_admin()
  );
create policy tutsr_insert on public.tutor_student_relationships
  for insert to authenticated with check (
    created_by = auth.uid()
    and organization_id in (select public.auth_organization_ids())
    and (
      public.has_org_role(organization_id, 'org_admin')
      or exists (select 1 from public.parent_student_relationships r
                 where r.student_id = tutor_student_relationships.student_id and r.status = 'active'
                   and r.permission_level = 'full_management' and r.parent_id = auth.uid())
    )
  );
create policy tutsr_update on public.tutor_student_relationships
  for update to authenticated using (tutor_id = auth.uid() or public.can_manage_student(student_id));

alter table public.conversations enable row level security;
create policy conversations_select on public.conversations
  for select to authenticated using (
    exists (select 1 from public.conversation_participants cp
            where cp.conversation_id = conversations.id
              and cp.user_role_id in (select public.auth_user_role_ids()))
    or public.is_platform_admin()
  );
create policy conversations_insert on public.conversations
  for insert to authenticated with check (organization_id in (select public.auth_organization_ids()));

alter table public.conversation_participants enable row level security;
create policy conversation_participants_select on public.conversation_participants
  for select to authenticated using (
    exists (select 1 from public.conversation_participants cp
            where cp.conversation_id = conversation_participants.conversation_id
              and cp.user_role_id in (select public.auth_user_role_ids()))
  );
create policy conversation_participants_insert on public.conversation_participants
  for insert to authenticated with check (
    exists (select 1 from public.parent_student_relationships r where r.status = 'active'
            and (r.parent_id = (select user_id from public.user_roles where id = conversation_participants.user_role_id)
                 or r.student_id in (select s.id from public.students s where s.user_role_id = conversation_participants.user_role_id)))
    or exists (select 1 from public.teacher_student_relationships r where r.status = 'active'
               and (r.teacher_id = (select user_id from public.user_roles where id = conversation_participants.user_role_id)
                    or r.student_id in (select s.id from public.students s where s.user_role_id = conversation_participants.user_role_id)))
    or exists (select 1 from public.tutor_student_relationships r where r.status = 'active'
               and (r.tutor_id = (select user_id from public.user_roles where id = conversation_participants.user_role_id)
                    or r.student_id in (select s.id from public.students s where s.user_role_id = conversation_participants.user_role_id)))
    or exists (select 1 from public.user_roles ur join public.roles ro on ro.id = ur.role_id
               where ur.id = conversation_participants.user_role_id and ro.code = 'org_admin')
  );

alter table public.messages enable row level security;
create policy messages_select on public.messages
  for select to authenticated using (
    exists (select 1 from public.conversation_participants cp
            where cp.conversation_id = messages.conversation_id
              and cp.user_role_id in (select public.auth_user_role_ids()))
  );
create policy messages_insert on public.messages
  for insert to authenticated with check (
    sender_user_role_id in (select public.auth_user_role_ids())
    and exists (select 1 from public.conversation_participants cp
                where cp.conversation_id = messages.conversation_id and cp.user_role_id = messages.sender_user_role_id)
  );
create policy messages_update on public.messages
  for update to authenticated using (
    exists (select 1 from public.conversation_participants cp
            where cp.conversation_id = messages.conversation_id
              and cp.user_role_id in (select public.auth_user_role_ids()))
  );

alter table public.plans enable row level security;
create policy plans_select on public.plans for select to authenticated using (true);

alter table public.organization_subscriptions enable row level security;
create policy org_subscriptions_select on public.organization_subscriptions
  for select to authenticated using (
    organization_id in (select public.auth_organization_ids()) or public.is_platform_admin()
  );

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications
  for select to authenticated using (recipient_user_role_id in (select public.auth_user_role_ids()));
create policy notifications_insert on public.notifications
  for insert to authenticated with check (
    exists (select 1 from public.user_roles ur
            where ur.id = recipient_user_role_id
              and ur.organization_id in (select public.auth_organization_ids()))
  );
create policy notifications_update on public.notifications
  for update to authenticated using (recipient_user_role_id in (select public.auth_user_role_ids()));

alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (
    public.is_platform_admin()
    or (organization_id is not null and public.has_org_role(organization_id, 'org_admin'))
  );
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated with check (actor_user_id = auth.uid());

alter table public.security_events enable row level security;
create policy security_events_platform_admin_only on public.security_events
  for select to authenticated using (public.is_platform_admin());

-- ===== PROFILE AUTO-CREATION =====
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===== SEED DATA =====
insert into public.curricula (code, name) values ('CBC', 'Kenya Competency-Based Curriculum');

with c as (select id from public.curricula where code = 'CBC')
insert into public.grades (curriculum_id, name, sequence_order, pathway_required)
select c.id, g.name, g.seq, g.pw from c,
  (values ('Grade 7', 7, false), ('Grade 8', 8, false), ('Grade 9', 9, false), ('Grade 10', 10, true)) as g(name, seq, pw);

insert into public.pathways (grade_id, name)
select g.id, p.name from public.grades g,
  (values ('STEM'), ('Social Sciences'), ('Arts & Sports Science')) as p(name)
where g.sequence_order = 10;

insert into public.subjects (grade_id, name, code)
select g.id, s.name, s.code from public.grades g,
  (values ('Mathematics','MATH'), ('Integrated Science','SCI'), ('English','ENG')) as s(name, code)
where g.sequence_order in (7,8,9);

insert into public.subjects (grade_id, pathway_id, name, code)
select g.id, p.id, s.name, s.code
from public.grades g
join public.pathways p on p.grade_id = g.id,
  lateral (values ('Advanced Mathematics','MATH-A'), ('Pathway Seminar','SEM')) as s(name, code)
where g.sequence_order = 10;

insert into public.competencies (subject_id, name, description)
select s.id, c.name, c.descr from public.subjects s,
  (values ('Problem Solving','Applies concepts to solve unfamiliar problems'),
          ('Communication','Explains reasoning clearly in writing and speech')) as c(name, descr);

insert into public.lessons (subject_id, title, sequence_order, content_type, content_body)
select s.id, s.name || ' — Lesson ' || l.n, l.n, 'text',
       jsonb_build_object('summary', 'Introductory material for ' || s.name || ', part ' || l.n)
from public.subjects s, (values (1), (2)) as l(n);

insert into public.plans (code, name, eligible_tenant_types, entitlements, price_amount, price_currency) values
  ('family', 'Family', array['family'], '{"max_students": 5}'::jsonb, 500, 'KES'),
  ('tutor', 'Tutor', array['independent_tutor'], '{"max_students": 20}'::jsonb, 1500, 'KES'),
  ('institution', 'Institution', array['private_school','homeschool_academy','learning_centre','ngo'], '{"max_students": 500}'::jsonb, 15000, 'KES');

insert into public.organizations (name, tenant_type, default_curriculum_id, younger_student_independent_login)
select 'Demo Family Organization', 'family', c.id, false from public.curricula c where c.code = 'CBC';

insert into public.organization_subscriptions (organization_id, plan_id, status)
select o.id, p.id, 'trial'
from public.organizations o, public.plans p
where o.tenant_type = 'family' and p.code = 'family';