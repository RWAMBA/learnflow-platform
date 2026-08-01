# LearnFlow Platform

PROJECT OVERVIEW

Build "Platform" (a placeholder name — do not invent a brand name, logo, or marketing copy; use generic labels like "the Platform" or "Dashboard" in the UI): a multi-tenant SaaS system for homeschooling and alternative education, launching as a single Kenya-based tenant. The architecture must support additional tenants, curricula, currencies, and languages later without redesign, even though this build seeds and runs only one active tenant.

Six roles: Student, Parent/Guardian, Teacher, Tutor, Organization Administrator, Super Administrator. A single user account can hold more than one role (e.g., Parent + Tutor), each independently scoped to an organization.

TECH STACK (non-negotiable)

Next.js (App Router), React, TypeScript

Tailwind CSS, shadcn/ui components

Supabase: Postgres database, Supabase Auth, Supabase Storage

Clean architecture / feature-based folder organization

Production-ready code quality — this is not a throwaway prototype

DATABASE SCHEMA

 If a Supabase project is connected, generate and apply the approved PostgreSQL schema as Supabase SQL migrations before generating application code. The implementation must use the schema exactly as defined in the approved architecture rather than re-deriving tables or relationships from the feature descriptions.                                     Generate the complete production-ready Supabase SQL migration for the approved database schema. Include every table, foreign key, composite foreign key, index, trigger, function, storage bucket, Row-Level Security policy, helper function, and seed data exactly as approved. This migration should execute successfully on a clean Supabase PostgreSQL database without requiring manual modification.                                                                                                                                                                                                          Run this exact SQL against the connected Supabase project as a migration, in this order, before building any UI on top of it:              

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



create table public.platform_admins (

  id uuid primary key default gen_random_uuid(),

  user_id uuid not null unique references public.profiles(id) on delete cascade,

  status text not null default 'active' check (status in ('active','revoked')),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  created_by uuid references public.profiles(id),

  updated_by uuid references public.profiles(id)

);



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



create table public.roles (

  id uuid primary key default gen_random_uuid(),

  code text not null unique,

  name text not null,

  created_at timestamptz not null default now()

);



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



-- ===== PLATFORM CONFIGURATION =====

create table public.system_settings (

  key text primary key,

  value jsonb not null,

  description text,

  updated_by uuid references public.profiles(id),

  updated_at timestamptz not null default now()

);



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



create table public.pathways (

  id uuid primary key default gen_random_uuid(),

  grade_id uuid not null references public.grades(id) on delete cascade,

  name text not null,

  created_at timestamptz not null default now()

);



create table public.subjects (

  id uuid primary key default gen_random_uuid(),

  grade_id uuid not null references public.grades(id) on delete cascade,

  pathway_id uuid references public.pathways(id),

  name text not null,

  code text,

  created_at timestamptz not null default now()

);



create table public.competencies (

  id uuid primary key default gen_random_uuid(),

  subject_id uuid not null references public.subjects(id) on delete cascade,

  name text not null,

  description text,

  created_at timestamptz not null default now()

);



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



create table public.assessments (

  id uuid primary key default gen_random_uuid(),

  assignment_id uuid not null references public.assignments(id) on delete cascade,

  graded_by_user_role_id uuid references public.user_roles(id),

  result jsonb not null default '{}'::jsonb,

  graded_at timestamptz,

  created_at timestamptz not null default now()

);



create table public.progress_records (

  id uuid primary key default gen_random_uuid(),

  student_id uuid not null references public.students(id) on delete cascade,

  competency_id uuid not null references public.competencies(id),

  assessment_id uuid references public.assessments(id),

  mastery_level text not null check (mastery_level in ('emerging','developing','proficient','advanced')),

  recorded_at timestamptz not null default now()

);



-- ===== RELATIONSHIPS (three dedicated tables — do not merge into one polymorphic table) =====

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



create or replace function public.set_audit_fields()

returns trigger

language plpgsql as $$

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



-- ===== COMMUNICATION =====

create table public.conversations (

  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null references public.organizations(id) on delete cascade,

  created_at timestamptz not null default now()

);



create table public.conversation_participants (

  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null references public.conversations(id) on delete cascade,

  user_role_id uuid not null references public.user_roles(id),

  joined_at timestamptz not null default now(),

  unique (conversation_id, user_role_id)

);



create table public.messages (

  id uuid primary key default gen_random_uuid(),

  conversation_id uuid not null references public.conversations(id) on delete cascade,

  sender_user_role_id uuid not null references public.user_roles(id),

  body text not null,

  sent_at timestamptz not null default now(),

  read_at timestamptz

);



-- ===== SUBSCRIPTION (manual assignment at MVP — no live payment processing) =====

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



-- ===== NOTIFICATIONS, AUDIT & SECURITY EVENTS =====

create table public.notifications (

  id uuid primary key default gen_random_uuid(),

  recipient_user_role_id uuid not null references public.user_roles(id),

  type text not null,

  payload jsonb not null default '{}'::jsonb,

  read_at timestamptz,

  created_at timestamptz not null default now()

);



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



-- ===== RLS HELPER FUNCTIONS =====

create or replace function public.auth_organization_ids()

returns setof uuid

language sql stable security definer as $$

  select om.organization_id

  from public.organization_memberships om

  where om.user_id = auth.uid() and om.status = 'active';

$$;



create or replace function public.auth_user_role_ids(p_role_code text default null)

returns setof uuid

language sql stable security definer as $$

  select ur.id

  from public.user_roles ur

  join public.roles r on r.id = ur.role_id

  where ur.user_id = auth.uid()

    and ur.status = 'active'

    and (p_role_code is null or r.code = p_role_code);

$$;



create or replace function public.is_platform_admin()

returns boolean

language sql stable security definer as $$

  select exists (

    select 1 from public.platform_admins

    where user_id = auth.uid() and status = 'active'

  );

$$;



-- ===== RLS POLICIES =====

alter table public.organizations enable row level security;

create policy org_isolation_select on public.organizations

  for select using (id in (select auth_organization_ids()) or is_platform_admin());

create policy org_platform_admin_write on public.organizations

  for update using (is_platform_admin());



alter table public.organization_memberships enable row level security;

create policy membership_visibility on public.organization_memberships

  for select using (

    user_id = auth.uid() or organization_id in (select auth_organization_ids()) or is_platform_admin()

  );



alter table public.user_roles enable row level security;

create policy user_role_visibility on public.user_roles

  for select using (

    user_id = auth.uid() or organization_id in (select auth_organization_ids()) or is_platform_admin()

  );



alter table public.students enable row level security;

create policy students_tenant_isolation on public.students

  for select using (organization_id in (select auth_organization_ids()) or is_platform_admin());



alter table public.parent_student_relationships enable row level security;

create policy psr_select on public.parent_student_relationships

  for select using (

    parent_id = auth.uid() or organization_id in (select auth_organization_ids()) or is_platform_admin()

  );

create policy psr_insert on public.parent_student_relationships

  for insert with check (

    created_by = auth.uid()

    and organization_id in (select auth_organization_ids())

    and (

      exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id

              where ur.user_id = auth.uid() and r.code = 'org_admin' and ur.status = 'active'

                and ur.organization_id = parent_student_relationships.organization_id)

      or auth.uid() = (select created_by from public.students where id = student_id)

      or exists (select 1 from public.parent_student_relationships r

                 where r.student_id = parent_student_relationships.student_id and r.status = 'active'

                   and r.permission_level = 'full_management' and r.parent_id = auth.uid())

    )

  );



alter table public.teacher_student_relationships enable row level security;

create policy tsr_select on public.teacher_student_relationships

  for select using (

    teacher_id = auth.uid() or organization_id in (select auth_organization_ids()) or is_platform_admin()

  );

create policy tsr_insert on public.teacher_student_relationships

  for insert with check (

    created_by = auth.uid()

    and organization_id in (select auth_organization_ids())

    and (

      exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id

              where ur.user_id = auth.uid() and r.code = 'org_admin' and ur.status = 'active'

                and ur.organization_id = teacher_student_relationships.organization_id)

      or exists (select 1 from public.parent_student_relationships r

                 where r.student_id = teacher_student_relationships.student_id and r.status = 'active'

                   and r.permission_level = 'full_management' and r.parent_id = auth.uid())

    )

  );



alter table public.tutor_student_relationships enable row level security;

create policy tutsr_select on public.tutor_student_relationships

  for select using (

    tutor_id = auth.uid() or organization_id in (select auth_organization_ids()) or is_platform_admin()

  );

create policy tutsr_insert on public.tutor_student_relationships

  for insert with check (

    created_by = auth.uid()

    and organization_id in (select auth_organization_ids())

    and (

      exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id

              where ur.user_id = auth.uid() and r.code = 'org_admin' and ur.status = 'active'

                and ur.organization_id = tutor_student_relationships.organization_id)

      or exists (select 1 from public.parent_student_relationships r

                 where r.student_id = tutor_student_relationships.student_id and r.status = 'active'

                   and r.permission_level = 'full_management' and r.parent_id = auth.uid())

    )

  );



create policy assignments_insert on public.assignments

  for insert with check (

    created_by_user_role_id in (select auth_user_role_ids())

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



alter table public.conversation_participants enable row level security;

create policy conversation_participants_insert on public.conversation_participants

  for insert with check (

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

  for select using (

    exists (select 1 from public.conversation_participants cp

            where cp.conversation_id = messages.conversation_id

              and cp.user_role_id in (select auth_user_role_ids()))

  );

create policy messages_insert on public.messages

  for insert with check (

    sender_user_role_id in (select auth_user_role_ids())

    and exists (select 1 from public.conversation_participants cp

                where cp.conversation_id = messages.conversation_id and cp.user_role_id = messages.sender_user_role_id)

  );



alter table public.security_events enable row level security;

create policy security_events_platform_admin_only on public.security_events

  for select using (is_platform_admin());



-- Apply the same auth_organization_ids()/auth_user_role_ids() pattern shown above

-- to curricula, grades, pathways, subjects, competencies, lessons, assessments,

-- progress_records, notifications, plans, organization_subscriptions, and

-- audit_logs (platform-admin-only + own-organization for audit_logs).



-- ===== SEED DATA (single active tenant, per approved MVP scope) =====

insert into public.curricula (code, name) values ('CBC', 'Kenya Competency-Based Curriculum');

-- Seed a small representative slice of CBC grades/pathways/subjects — enough to

-- demo the Content Spine, not a complete curriculum: e.g. Grade 7, Grade 8,

-- Grade 9 (Junior Secondary, no pathway) and Grade 10 (Senior Secondary, with

-- STEM / Social Sciences / Arts & Sports Science pathways) with 2–3 sample

-- subjects and 1–2 sample lessons per subject.

insert into public.plans (code, name, eligible_tenant_types, entitlements, price_amount, price_currency) values

  ('family', 'Family', array['family'], '{"max_students": 5}'::jsonb, 500, 'KES'),

  ('tutor', 'Tutor', array['independent_tutor'], '{"max_students": 20}'::jsonb, 1500, 'KES'),

  ('institution', 'Institution', array['private_school','homeschool_academy','learning_centre','ngo'], '{"max_students": 500}'::jsonb, 15000, 'KES');

-- Seed exactly one Organization with tenant_type = 'family' (the MVP's single

-- active tenant), its default_curriculum_id pointing at CBC, and one

-- organization_subscriptions row on the 'family' plan with status = 'trial'.

 DESIGN SYSTEM

Use shadcn/ui with Tailwind CSS. Set these exact CSS variables in globals.css (light mode in :root, dark mode in .dark):

:root {

  --background: 0 0% 100%; --foreground: 160 15% 12%;

  --card: 0 0% 100%; --card-foreground: 160 15% 12%;

  --popover: 0 0% 100%; --popover-foreground: 160 15% 12%;

  --primary: 158 64% 24%; --primary-foreground: 0 0% 100%;

  --secondary: 42 87% 55%; --secondary-foreground: 160 15% 12%;

  --muted: 160 10% 95%; --muted-foreground: 160 8% 40%;

  --accent: 158 40% 92%; --accent-foreground: 158 64% 20%;

  --destructive: 0 72% 45%; --destructive-foreground: 0 0% 100%;

  --success: 142 60% 35%; --warning: 38 90% 50%; --info: 200 70% 45%;

  --border: 160 10% 88%; --input: 160 10% 88%; --ring: 158 64% 32%;

  --radius: 0.5rem;

}

.dark {

  --background: 160 15% 8%; --foreground: 160 5% 95%;

  --card: 160 14% 11%; --card-foreground: 160 5% 95%;

  --popover: 160 14% 11%; --popover-foreground: 160 5% 95%;

  --primary: 158 55% 45%; --primary-foreground: 160 15% 8%;

  --secondary: 42 70% 55%; --secondary-foreground: 160 15% 8%;

  --muted: 160 10% 18%; --muted-foreground: 160 8% 65%;

  --accent: 158 25% 20%; --accent-foreground: 158 55% 85%;

  --destructive: 0 62% 45%; --destructive-foreground: 0 0% 100%;

  --success: 142 50% 45%; --warning: 38 80% 55%; --info: 200 60% 55%;

  --border: 160 10% 22%; --input: 160 10% 22%; --ring: 158 55% 45%;

}

Font: Inter (variable font), fallback system-ui, -apple-system, "Segoe UI", Roboto, sans-serif. Body text defaults to 18px (not the more typical 16px), given the young-learner audience.

Icons: lucide-react exclusively.

The amber --secondary token is reserved for achievements, certifications, advanced mastery, and celebratory UI only. Use outline/ghost button variants for everyday secondary actions — never the secondary variant for routine UI.

WCAG 2.2 AA is the platform-wide minimum. AAA contrast applies specifically to educational learning content (lesson viewing, assignment instructions, assessment-taking, progress/mastery displays) regardless of which role is viewing it — administrative/analytics screens (Organization Administrator, Super Administrator) target AA.

Motion: short (150–250ms), purposeful only (communicates a real state change), respects prefers-reduced-motion. No decorative animation.

Mobile-first: design and test against a narrow viewport first; this platform's primary market is mobile, often on mid-range Android devices.

USER ROLES & THE RELATIONSHIP MODEL

Six roles, held via user_roles (a User can hold several, each scoped to an organization): Student, Parent/Guardian, Teacher, Tutor, Organization Administrator, Super Administrator (the last is platform_admins, not user_roles — it is platform-wide, not tenant-scoped).

Build a Role Context Switcher in the top navigation: shown only when the signed-in user holds more than one active user_roles row; hidden entirely otherwise. Switching context changes what the UI displays, but backend authorization always comes from the database (RLS), never from which context the UI currently shows — do not gate any data access purely on client-side "current role" state.

Educational relationships are three dedicated tables (parent_student_relationships, teacher_student_relationships, tutor_student_relationships), each with its own lifecycle: pending_invitation → active → suspended/ended, or declined/expired. Teachers and Tutors can never create their own relationship rows — only an Organization Administrator or a Parent/Guardian (with full_management permission) may create or approve a Parent/Teacher/Tutor↔Student relationship. This is enforced by RLS already; do not build a UI path that lets a Teacher/Tutor "add themselves" to a Student.

DASHBOARD ARCHITECTURE

Build one shared Dashboard Shell (top bar: Role Context Switcher, notifications, profile menu; a permission-filtered grid of widgets) rather than six separate hardcoded dashboard pages. Widgets, by role:

Student (senior-secondary only — see Independent Login below): today's due lessons/assignments, subject grid, progress summary, messages preview.

Parent/Guardian: one card per linked Student (progress, next-due assignment, unread messages), messages preview, pending invitations (if full_management).

Teacher / Tutor: roster list (their linked Students), grading queue (assignments in submitted status, with a visually distinct Overdue indicator), progress summaries, messages preview.

Organization Administrator: member counts by role, organization-wide progress rollup, pending invitations. Exception: for a family-type organization, merge these into the Parent widget set instead of showing a separate admin dashboard shell — same roles/permissions underneath, different widget composition only.

Super Administrator: platform-wide tenant list/health, audit log highlights. This role sees data across all organizations via platform_admins, not organization_memberships.

WHAT TO BUILD (MVP SCOPE)

Email/password auth via Supabase Auth, with email verification required before full access, and password reset.

Organization setup already seeded (see Seed Data above) — no self-service "create a new organization" flow needed at this stage; the app runs against the single seeded tenant.

Parent registers or is invited, creates Student profile(s), links Teachers/Tutors to Students via the invitation flow (pending → active).

CBC curriculum browsing: Grade → Subject → Lesson, respecting the seeded Pathway split at Grade 10+.

Assignments: Teacher/Tutor/Org Admin can create for any Student they have an active relationship with (or org-wide, for Org Admin); a Parent/Guardian may create an assignment only for their own linked Student, never for an unrelated Student or organization-wide. States: Not Started → In Progress → Submitted → Graded, with an Overdue flag.

Grading an assignment produces an Assessment and a Progress record (mastery level: emerging/developing/proficient/advanced), visible to the Student, their linked Parent(s), and the grading Teacher/Tutor.

Simple 1:1 messaging: a Student (senior-secondary, independent login) may message only their linked Parent(s)/Guardian(s), assigned Teacher(s)/Tutor(s), and the Organization Administrator where applicable — never an arbitrary platform user. Enforce this through the relationship tables, as the schema's RLS already does.

Subscription: show the organization's assigned plan and entitlements; plan assignment is manual at MVP — do not build live payment processing.

In-app notifications for new messages, due/overdue assignments, new progress records, and relationship invitations.

Independent login for Students: only for senior-secondary grades (10–12), and only when the organization's younger_student_independent_login flag allows it. Younger Students have no login of their own at MVP — they are represented entirely through their Parent's view.

Basic Super Administrator views: tenant list, audit log (platform-admin only).

EXPLICITLY OUT OF SCOPE FOR THIS BUILD

Do not build: native mobile apps, offline/PWA mode, an AI tutor or AI-generated content of any kind, an examinations engine or digital certificates, discussion forums, a content marketplace, a public API, white-label theming, live payment integration (M-Pesa/Pesapal/Flutterwave/Stripe), or a self-service flow for onboarding a second organization. The schema supports all of these later without redesign — the UI for them does not need to exist yet.

CODE ORGANIZATION FOR FUTURE CURSOR WORK

Organize by feature, not by technical layer, so a developer can continue this in Cursor without re-learning the structure: e.g. app/(dashboard)/students/, app/(dashboard)/assignments/, app/(dashboard)/messages/, each with its own components/queries/types colocated. Keep Supabase queries in a thin data-access layer per feature, not scattered inline in components. Prefer direct Supabase client calls (relying on RLS) for simple reads/writes; use a Next.js Route Handler only for genuine multi-step operations (creating an organization membership + role together, grading an assignment and writing progress in one transaction, starting a new conversation). Never bypass RLS with a service-role key from client-reachable code.                                                    ---

# Final Implementation Requirements

The generated application must prioritize architectural fidelity, maintainability, scalability, and production readiness over minimizing output size. Do not simplify or omit approved architectural decisions, database relationships, authorization rules, reusable components, dashboards, or core platform functionality for the sake of brevity.

## Database & Supabase

- Generate the complete PostgreSQL database schema as Supabase SQL migrations rather than relying solely on runtime table creation.

- Ensure all migrations are organized, version-controlled, and compatible with the Supabase CLI.

- Generate Row-Level Security (RLS) policies exactly as specified in the architecture.

- Include database indexes, foreign keys, constraints, triggers, and audit fields.

## Environment Configuration

Generate a `.env.example` file listing every required environment variable without including any secrets.

Include placeholders for variables such as:

- NEXT_PUBLIC_SUPABASE_URL

- NEXT_PUBLIC_SUPABASE_ANON_KEY

- SUPABASE_SERVICE_ROLE_KEY

- RESEND_API_KEY

- SENTRY_DSN

- Any additional environment variables required by the application.

## Forms

Use React Hook Form together with Zod for all forms requiring validation.

Validation should be:

- strongly typed

- reusable

- accessible

- shared between client and server where appropriate.

## Next.js Architecture

Use Next.js App Router best practices.

Prefer Server Components by default.

Only use Client Components where browser APIs, user interaction, or local state management require them.

Use Server Actions where appropriate and maintain a clear separation between server and client responsibilities.

## Data Loading

Every page, dashboard, table, list, and asynchronous component should provide:

- loading state

- empty state

- error state

- success state

Use:

- loading.tsx

- React Suspense

- skeleton loaders

where appropriate to provide a smooth user experience.

## Images

Use the Next.js Image component for all application images to provide responsive loading, optimization, and performance benefits.

## Error Handling

Generate production-ready error handling including:

- Global error boundaries

- Route-level error boundaries

- Custom error pages

- Custom not-found pages

- Graceful fallback UI for failed requests

Ensure errors are structured for integration with Sentry.

## Code Quality

Generate clean, modular, reusable, and strongly typed code.

Avoid duplication.

Use feature-based organization.

Follow modern React and TypeScript best practices.

Use meaningful naming conventions throughout the project.

## Accessibility

Ensure all generated components meet WCAG requirements established during the architecture phase.

Support:

- keyboard navigation

- ARIA attributes where appropriate

- focus management

- screen readers

- reduced motion preferences

## Maintainability

Generate code that is easy to extend within Cursor after the initial generation.

Favor reusable components, shared utilities, custom hooks, and clearly separated business logic.

Avoid tightly coupled implementations.

## Architectural Fidelity

This project has already undergone a complete architecture and planning phase.

The generated application must faithfully implement the approved architecture rather than redesigning or simplifying it.

Do not replace, remove, or alter approved:

- multi-tenant architecture

- database schema

- relationship model

- authorization model

- RLS strategy

- dashboard structure

- reusable component architecture

- design system

- security architecture

- API design

- project structure

## Multi-Pass Generation

If the complete implementation exceeds Lovable's generation limits, continue the implementation across multiple sequential generation passes.

Each pass must preserve the previously generated code and maintain complete consistency with the approved architecture.

Architectural correctness, completeness, and maintainability take priority over producing the application in a single response.

The final result should be a production-ready application that serves as a robust foundation for continued development in Cursor.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f140a695-8837-432e-854f-187251a8569b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
