
-- Helper: who may author curriculum inside an organization
create or replace function app_private.can_author_curriculum(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_id is not null and (
    app_private.has_org_role(p_org_id, 'org_admin')
    or app_private.has_org_role(p_org_id, 'teacher')
    or app_private.has_org_role(p_org_id, 'tutor')
  );
$$;
revoke execute on function app_private.can_author_curriculum(uuid) from public;

-- ---------------------------------------------------------------- subjects
alter table public.subjects
  add column if not exists description text,
  add column if not exists status text not null default 'published',
  add column if not exists authoring_organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists published_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.subjects drop constraint if exists subjects_status_check;
alter table public.subjects add constraint subjects_status_check
  check (status in ('draft','published','archived'));

alter table public.lessons
  add column if not exists topic_id uuid,
  add column if not exists status text not null default 'published',
  add column if not exists published_at timestamptz;

alter table public.lessons drop constraint if exists lessons_status_check;
alter table public.lessons add constraint lessons_status_check
  check (status in ('draft','published','archived'));

-- ------------------------------------------------------------------ topics
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  description text,
  sequence_order integer not null default 1,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  authoring_organization_id uuid references public.organizations(id) on delete cascade,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists topics_subject_idx on public.topics(subject_id, sequence_order);

alter table public.lessons drop constraint if exists lessons_topic_id_fkey;
alter table public.lessons add constraint lessons_topic_id_fkey
  foreign key (topic_id) references public.topics(id) on delete set null;
create index if not exists lessons_topic_idx on public.lessons(topic_id, sequence_order);

grant select, insert, update, delete on public.topics to authenticated;
grant all on public.topics to service_role;
alter table public.topics enable row level security;

drop policy if exists topics_select on public.topics;
create policy topics_select on public.topics for select to authenticated
  using (
    status = 'published'
    or authoring_organization_id in (select app_private.auth_organization_ids())
  );
drop policy if exists topics_insert on public.topics;
create policy topics_insert on public.topics for insert to authenticated
  with check (app_private.can_author_curriculum(authoring_organization_id));
drop policy if exists topics_update on public.topics;
create policy topics_update on public.topics for update to authenticated
  using (app_private.can_author_curriculum(authoring_organization_id))
  with check (app_private.can_author_curriculum(authoring_organization_id));
drop policy if exists topics_delete on public.topics;
create policy topics_delete on public.topics for delete to authenticated
  using (app_private.can_author_curriculum(authoring_organization_id));

create trigger topics_set_updated_at before update on public.topics
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------- learning objectives
create table if not exists public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  competency_id uuid references public.competencies(id) on delete set null,
  description text not null,
  sequence_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists learning_objectives_lesson_idx
  on public.learning_objectives(lesson_id, sequence_order);

grant select, insert, update, delete on public.learning_objectives to authenticated;
grant all on public.learning_objectives to service_role;
alter table public.learning_objectives enable row level security;

drop policy if exists learning_objectives_select on public.learning_objectives;
create policy learning_objectives_select on public.learning_objectives for select to authenticated
  using (exists (
    select 1 from public.lessons l
    where l.id = lesson_id
      and (l.status = 'published' or l.authoring_organization_id in (select app_private.auth_organization_ids()))
  ));
drop policy if exists learning_objectives_write on public.learning_objectives;
create policy learning_objectives_write on public.learning_objectives for all to authenticated
  using (exists (
    select 1 from public.lessons l
    where l.id = lesson_id and app_private.can_author_curriculum(l.authoring_organization_id)
  ))
  with check (exists (
    select 1 from public.lessons l
    where l.id = lesson_id and app_private.can_author_curriculum(l.authoring_organization_id)
  ));

create trigger learning_objectives_set_updated_at before update on public.learning_objectives
  for each row execute function public.set_updated_at();

-- --------------------------------------------- subject / lesson authoring
drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects for select to authenticated
  using (
    status = 'published'
    or authoring_organization_id in (select app_private.auth_organization_ids())
  );
drop policy if exists subjects_insert on public.subjects;
create policy subjects_insert on public.subjects for insert to authenticated
  with check (app_private.can_author_curriculum(authoring_organization_id));
drop policy if exists subjects_update on public.subjects;
create policy subjects_update on public.subjects for update to authenticated
  using (app_private.can_author_curriculum(authoring_organization_id))
  with check (app_private.can_author_curriculum(authoring_organization_id));
drop policy if exists subjects_delete on public.subjects;
create policy subjects_delete on public.subjects for delete to authenticated
  using (app_private.can_author_curriculum(authoring_organization_id));

drop policy if exists lessons_select on public.lessons;
create policy lessons_select on public.lessons for select to authenticated
  using (
    status = 'published'
    or authoring_organization_id in (select app_private.auth_organization_ids())
  );
drop policy if exists lessons_insert on public.lessons;
create policy lessons_insert on public.lessons for insert to authenticated
  with check (app_private.can_author_curriculum(authoring_organization_id));
drop policy if exists lessons_update on public.lessons;
create policy lessons_update on public.lessons for update to authenticated
  using (app_private.can_author_curriculum(authoring_organization_id))
  with check (app_private.can_author_curriculum(authoring_organization_id));
drop policy if exists lessons_delete on public.lessons;
create policy lessons_delete on public.lessons for delete to authenticated
  using (app_private.can_author_curriculum(authoring_organization_id));

-- --------------------------------------- curriculum assignment to students
create table if not exists public.student_curriculum_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  status text not null default 'active' check (status in ('active','completed','paused')),
  notes text,
  assigned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, subject_id)
);
create index if not exists student_curriculum_assignments_student_idx
  on public.student_curriculum_assignments(student_id);

grant select, insert, update, delete on public.student_curriculum_assignments to authenticated;
grant all on public.student_curriculum_assignments to service_role;
alter table public.student_curriculum_assignments enable row level security;

drop policy if exists student_curriculum_assignments_select on public.student_curriculum_assignments;
create policy student_curriculum_assignments_select on public.student_curriculum_assignments
  for select to authenticated using (app_private.can_view_student(student_id));

drop policy if exists student_curriculum_assignments_write on public.student_curriculum_assignments;
create policy student_curriculum_assignments_write on public.student_curriculum_assignments
  for all to authenticated
  using (
    app_private.can_manage_student(student_id)
    or exists (select 1 from public.teacher_student_relationships r
               where r.student_id = student_curriculum_assignments.student_id
                 and r.status = 'active' and r.teacher_id = auth.uid())
    or exists (select 1 from public.tutor_student_relationships r
               where r.student_id = student_curriculum_assignments.student_id
                 and r.status = 'active' and r.tutor_id = auth.uid())
  )
  with check (
    app_private.can_manage_student(student_id)
    or exists (select 1 from public.teacher_student_relationships r
               where r.student_id = student_curriculum_assignments.student_id
                 and r.status = 'active' and r.teacher_id = auth.uid())
    or exists (select 1 from public.tutor_student_relationships r
               where r.student_id = student_curriculum_assignments.student_id
                 and r.status = 'active' and r.tutor_id = auth.uid())
  );

create trigger student_curriculum_assignments_set_updated_at
  before update on public.student_curriculum_assignments
  for each row execute function public.set_updated_at();

-- ----------------------------- progress tracking hook for future assessment
alter table public.progress_records
  add column if not exists learning_objective_id uuid references public.learning_objectives(id) on delete cascade;
alter table public.progress_records alter column competency_id drop not null;
alter table public.progress_records drop constraint if exists progress_records_target_check;
alter table public.progress_records add constraint progress_records_target_check
  check (competency_id is not null or learning_objective_id is not null);
create index if not exists progress_records_objective_idx
  on public.progress_records(learning_objective_id);
