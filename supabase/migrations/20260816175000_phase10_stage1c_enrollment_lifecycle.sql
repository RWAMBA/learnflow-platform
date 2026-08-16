-- Phase 10 Stage 1C — curriculum enrollment lifecycle (HAND-AUTHORED, UNAPPLIED).
--
-- Creates public.academic_periods and public.curriculum_enrollments, the
-- purpose-specific calendar-authority helper, lifecycle/consistency guards, RLS
-- and the student_curriculum_assignments bridge column.
--
-- Forward-only and additive. No prior migration is edited. No table, column or
-- policy is dropped. No DML of any kind: no backfill, no seed, no delete.
-- Out of scope: SEC-006 stage two (no app_private.has_aal2() reference), Auth /
-- MFA configuration, Stage 1D and Stage 2 objects, any CRUD UI.

BEGIN;

-- ------------------------------------------------------- 0. fail-closed gate
DO $$
BEGIN
  -- 0a. Stage 1C objects must be entirely absent.
  IF to_regclass('public.academic_periods') IS NOT NULL THEN
    RAISE EXCEPTION 'Precondition failed: public.academic_periods already exists';
  END IF;
  IF to_regclass('public.curriculum_enrollments') IS NOT NULL THEN
    RAISE EXCEPTION 'Precondition failed: public.curriculum_enrollments already exists';
  END IF;
  IF to_regprocedure('app_private.can_administer_academic_period(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Precondition failed: can_administer_academic_period() already exists';
  END IF;
  IF to_regprocedure('app_private.enforce_academic_period_hierarchy()') IS NOT NULL
     OR to_regprocedure('app_private.enforce_curriculum_enrollment_lifecycle()') IS NOT NULL
     OR to_regprocedure('app_private.enforce_curriculum_enrollment_consistency()') IS NOT NULL
     OR to_regprocedure('app_private.enforce_assignment_enrollment_student()') IS NOT NULL THEN
    RAISE EXCEPTION 'Precondition failed: a Stage 1C guard function already exists';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'student_curriculum_assignments'
       AND column_name = 'curriculum_enrollment_id'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: assignment bridge column already exists';
  END IF;

  -- 0b. Required existing structures.
  IF to_regclass('public.organizations') IS NULL
     OR to_regclass('public.students') IS NULL
     OR to_regclass('public.grades') IS NULL
     OR to_regclass('public.pathways') IS NULL
     OR to_regclass('public.curriculum_versions') IS NULL
     OR to_regclass('public.student_curriculum_assignments') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: a required Stage 1A/1B table is missing';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NULL
     OR to_regprocedure('app_private.is_platform_admin()') IS NULL
     OR to_regprocedure('app_private.has_org_role(uuid, text)') IS NULL
     OR to_regprocedure('app_private.can_view_student(uuid)') IS NULL
     OR to_regprocedure('app_private.auth_organization_ids()') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: a required helper is missing';
  END IF;

  -- 0c. Authoritative policy baselines this migration relies on must be intact.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'student_curriculum_assignments'
       AND policyname = 'student_curriculum_assignments_select'
       AND qual = 'app_private.can_view_student(student_id)'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: student_curriculum_assignments read baseline changed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'students'
       AND policyname = 'students_tenant_isolation'
       AND qual LIKE '%has_org_role(organization_id, ''org_admin''::text)%'
  ) THEN
    RAISE EXCEPTION 'Precondition failed: students tenant-isolation baseline changed';
  END IF;

  -- 0d. Stage 1A/1B objects must still be present.
  IF to_regclass('public.curriculum_nodes') IS NULL
     OR to_regclass('public.learning_resources') IS NULL
     OR to_regclass('public.curriculum_providers') IS NULL
     OR to_regclass('public.education_stages') IS NULL
     OR to_regclass('public.subject_groups') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: a Stage 1A/1B object is missing';
  END IF;

  -- 0e. SEC-006 stage two must remain unapplied.
  IF to_regprocedure('app_private.has_aal2()') IS NOT NULL THEN
    RAISE EXCEPTION 'Precondition failed: SEC-006 stage two appears applied';
  END IF;
END
$$;

-- ------------------------------------------- 1. calendar-authority helper
-- Purpose-specific: calendar authority is deliberately NOT curriculum-content
-- authority, so app_private.can_author_curriculum() is neither broadened nor
-- reused here. Fails closed on a null organization.
CREATE FUNCTION app_private.can_administer_academic_period(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT app_private.is_platform_admin()
      OR (
        p_org_id IS NOT NULL
        AND app_private.has_org_role(p_org_id, 'org_admin')
      );
$fn$;

REVOKE ALL ON FUNCTION app_private.can_administer_academic_period(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.can_administer_academic_period(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app_private.can_administer_academic_period(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.can_administer_academic_period(uuid) TO service_role;

-- ------------------------------------------------------- 2. academic_periods
CREATE TABLE public.academic_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  parent_period_id uuid NULL,
  period_type text NOT NULL,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_periods_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT academic_periods_parent_period_id_fkey
    FOREIGN KEY (parent_period_id) REFERENCES public.academic_periods(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT academic_periods_period_type_check
    CHECK (period_type IN ('year','term','semester','quarter')),
  CONSTRAINT academic_periods_date_order_check
    CHECK (end_date > start_date),
  CONSTRAINT academic_periods_parent_not_self_check
    CHECK (parent_period_id IS NULL OR parent_period_id <> id)
);

CREATE INDEX academic_periods_organization_id_idx
  ON public.academic_periods (organization_id);
CREATE INDEX academic_periods_parent_period_id_idx
  ON public.academic_periods (parent_period_id);

CREATE TRIGGER academic_periods_set_updated_at
  BEFORE UPDATE ON public.academic_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Acyclicity, same-organization ancestry/descendants, depth and bidirectional
-- date containment. Authoritative maximum nesting depth is 32: a period's own
-- ancestor depth plus the relative depth of its deepest existing descendant.
CREATE FUNCTION app_private.enforce_academic_period_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_max_depth constant int := 32;
  v_parent uuid;
  v_parent_org uuid;
  v_parent_start date;
  v_parent_end date;
  v_ancestor_depth int := 0;
  v_subtree_depth int := 0;
  v_subtree_cycle boolean := false;
BEGIN
  IF NEW.parent_period_id IS NOT NULL THEN
    IF NEW.parent_period_id = NEW.id THEN
      RAISE EXCEPTION 'academic period cycle violation';
    END IF;

    SELECT p.organization_id, p.start_date, p.end_date
      INTO v_parent_org, v_parent_start, v_parent_end
      FROM public.academic_periods p WHERE p.id = NEW.parent_period_id;
    IF v_parent_org IS NULL THEN
      RAISE EXCEPTION 'academic period parent not found';
    END IF;
    IF v_parent_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'academic period parent must belong to the same organization';
    END IF;
    IF NEW.start_date < v_parent_start OR NEW.end_date > v_parent_end THEN
      RAISE EXCEPTION 'academic period must fall inside its parent period';
    END IF;

    -- Ancestor walk: cycle detection plus same-organization ancestry.
    v_parent := NEW.parent_period_id;
    WHILE v_parent IS NOT NULL LOOP
      v_ancestor_depth := v_ancestor_depth + 1;
      IF v_parent = NEW.id THEN
        RAISE EXCEPTION 'academic period cycle violation';
      END IF;
      -- Bounded one level past the authoritative limit: enough to prove the
      -- structure invalid without unbounded traversal.
      IF v_ancestor_depth > v_max_depth THEN
        RAISE EXCEPTION 'academic period depth limit exceeded';
      END IF;
      SELECT p.parent_period_id, p.organization_id INTO v_parent, v_parent_org
        FROM public.academic_periods p WHERE p.id = v_parent;
      IF v_parent_org IS NOT NULL AND v_parent_org <> NEW.organization_id THEN
        RAISE EXCEPTION 'academic period ancestry must belong to the same organization';
      END IF;
    END LOOP;
  END IF;

  -- Existing descendants travel with the period on a subtree move: depth,
  -- cycles, organization consistency and containment are all re-validated.
  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE subtree(id, depth, path, is_cycle) AS (
      SELECT NEW.id, 1, ARRAY[NEW.id], false
      UNION ALL
      SELECT c.id, s.depth + 1, s.path || c.id, c.id = ANY(s.path)
        FROM public.academic_periods c
        JOIN subtree s ON c.parent_period_id = s.id
       WHERE NOT s.is_cycle
         AND s.depth < (v_max_depth + 1)
    )
    SELECT max(s.depth), coalesce(bool_or(s.is_cycle), false)
      INTO v_subtree_depth, v_subtree_cycle
      FROM subtree s;

    IF v_subtree_cycle THEN
      RAISE EXCEPTION 'academic period cycle violation';
    END IF;

    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      IF EXISTS (
        WITH RECURSIVE subtree(id, path, is_cycle) AS (
          SELECT NEW.id, ARRAY[NEW.id], false
          UNION ALL
          SELECT c.id, s.path || c.id, c.id = ANY(s.path)
            FROM public.academic_periods c
            JOIN subtree s ON c.parent_period_id = s.id
           WHERE NOT s.is_cycle
        )
        SELECT 1 FROM public.academic_periods p
          JOIN subtree s ON s.id = p.id
         WHERE p.id <> NEW.id
           AND p.organization_id IS DISTINCT FROM NEW.organization_id
      ) THEN
        RAISE EXCEPTION 'academic period descendants must belong to the same organization';
      END IF;
    END IF;

    -- Containment is bidirectional: narrowing an ancestor must not orphan any
    -- existing descendant outside the resulting range.
    IF NEW.start_date IS DISTINCT FROM OLD.start_date
       OR NEW.end_date IS DISTINCT FROM OLD.end_date THEN
      IF EXISTS (
        WITH RECURSIVE subtree(id, path, is_cycle) AS (
          SELECT NEW.id, ARRAY[NEW.id], false
          UNION ALL
          SELECT c.id, s.path || c.id, c.id = ANY(s.path)
            FROM public.academic_periods c
            JOIN subtree s ON c.parent_period_id = s.id
           WHERE NOT s.is_cycle
        )
        SELECT 1 FROM public.academic_periods p
          JOIN subtree s ON s.id = p.id
         WHERE p.id <> NEW.id
           AND (p.start_date < NEW.start_date OR p.end_date > NEW.end_date)
      ) THEN
        RAISE EXCEPTION 'academic period descendants must fall inside the new date range';
      END IF;
    END IF;
  ELSE
    v_subtree_depth := 1;
  END IF;

  IF coalesce(v_subtree_depth, 1) + v_ancestor_depth > v_max_depth THEN
    RAISE EXCEPTION 'academic period subtree depth limit exceeded';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER academic_periods_enforce_hierarchy
  BEFORE INSERT OR UPDATE ON public.academic_periods
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_academic_period_hierarchy();

REVOKE ALL ON FUNCTION app_private.enforce_academic_period_hierarchy() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_academic_period_hierarchy() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_academic_period_hierarchy() FROM authenticated;

-- Sibling academic periods MAY overlap by human-authorized decision: no
-- exclusion constraint and no overlap trigger is created here, deliberately.

REVOKE ALL ON TABLE public.academic_periods FROM PUBLIC;
REVOKE ALL ON TABLE public.academic_periods FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_periods TO authenticated;
GRANT ALL ON public.academic_periods TO service_role;

ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY academic_periods_select ON public.academic_periods
  FOR SELECT TO authenticated
  USING (
    app_private.is_platform_admin()
    OR organization_id IN (SELECT app_private.auth_organization_ids())
  );

CREATE POLICY academic_periods_insert ON public.academic_periods
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_administer_academic_period(organization_id));

CREATE POLICY academic_periods_update ON public.academic_periods
  FOR UPDATE TO authenticated
  USING (app_private.can_administer_academic_period(organization_id))
  WITH CHECK (app_private.can_administer_academic_period(organization_id));

CREATE POLICY academic_periods_delete ON public.academic_periods
  FOR DELETE TO authenticated
  USING (app_private.can_administer_academic_period(organization_id));

-- -------------------------------------------------- 3. curriculum_enrollments
CREATE TABLE public.curriculum_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  curriculum_version_id uuid NOT NULL,
  academic_level_id uuid NOT NULL,
  track_id uuid NULL,
  academic_period_id uuid NULL,
  enrollment_category text NOT NULL,
  is_primary boolean GENERATED ALWAYS AS (enrollment_category = 'primary') STORED,
  status text NOT NULL DEFAULT 'pending',
  transferred_from_enrollment_id uuid NULL,
  enrolled_at timestamptz NULL,
  ended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_enrollments_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id)
    ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT curriculum_enrollments_curriculum_version_id_fkey
    FOREIGN KEY (curriculum_version_id) REFERENCES public.curriculum_versions(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT curriculum_enrollments_academic_level_id_fkey
    FOREIGN KEY (academic_level_id) REFERENCES public.grades(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT curriculum_enrollments_track_id_fkey
    FOREIGN KEY (track_id) REFERENCES public.pathways(id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT curriculum_enrollments_academic_period_id_fkey
    FOREIGN KEY (academic_period_id) REFERENCES public.academic_periods(id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT curriculum_enrollments_transferred_from_enrollment_id_fkey
    FOREIGN KEY (transferred_from_enrollment_id) REFERENCES public.curriculum_enrollments(id)
    ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT curriculum_enrollments_category_check
    CHECK (enrollment_category IN ('primary','supplementary')),
  CONSTRAINT curriculum_enrollments_status_check
    CHECK (status IN ('pending','active','completed','transferred','withdrawn','archived')),
  CONSTRAINT curriculum_enrollments_transfer_not_self_check
    CHECK (transferred_from_enrollment_id IS NULL OR transferred_from_enrollment_id <> id)
);

CREATE INDEX curriculum_enrollments_student_id_idx
  ON public.curriculum_enrollments (student_id);
CREATE INDEX curriculum_enrollments_curriculum_version_id_idx
  ON public.curriculum_enrollments (curriculum_version_id);
CREATE INDEX curriculum_enrollments_academic_level_id_idx
  ON public.curriculum_enrollments (academic_level_id);
CREATE INDEX curriculum_enrollments_academic_period_id_idx
  ON public.curriculum_enrollments (academic_period_id);
CREATE UNIQUE INDEX curriculum_enrollments_one_active_primary
  ON public.curriculum_enrollments (student_id)
  WHERE enrollment_category = 'primary' AND status = 'active';

CREATE TRIGGER curriculum_enrollments_set_updated_at
  BEFORE UPDATE ON public.curriculum_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Lifecycle: pending -> active -> (completed|transferred|withdrawn) -> archived.
-- Every other transition, including backward transitions, is rejected. Lifecycle
-- timestamps are database-authoritative; placement fields freeze on activation.
CREATE FUNCTION app_private.enforce_curriculum_enrollment_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_placement_changed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'curriculum enrollment lifecycle violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status NOT IN ('pending','active','completed','transferred','withdrawn','archived') THEN
    RAISE EXCEPTION 'curriculum enrollment lifecycle violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'curriculum enrollment lifecycle violation';
    END IF;
    -- The database, never the client, owns lifecycle timestamps.
    NEW.enrolled_at := NULL;
    NEW.ended_at := NULL;
    RETURN NEW;
  END IF;

  v_placement_changed := (
    NEW.student_id IS DISTINCT FROM OLD.student_id
    OR NEW.curriculum_version_id IS DISTINCT FROM OLD.curriculum_version_id
    OR NEW.academic_level_id IS DISTINCT FROM OLD.academic_level_id
    OR NEW.track_id IS DISTINCT FROM OLD.track_id
    OR NEW.academic_period_id IS DISTINCT FROM OLD.academic_period_id
    OR NEW.enrollment_category IS DISTINCT FROM OLD.enrollment_category
    OR NEW.transferred_from_enrollment_id IS DISTINCT FROM OLD.transferred_from_enrollment_id
  );

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'curriculum enrollment lifecycle violation';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'curriculum enrollment lifecycle violation';
  END IF;

  IF OLD.status = 'pending' THEN
    IF NEW.status = 'pending' THEN
      -- Placement remains editable while pending.
      NEW.enrolled_at := NULL;
      NEW.ended_at := NULL;
      RETURN NEW;
    END IF;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'curriculum enrollment lifecycle violation';
    END IF;
    IF v_placement_changed THEN
      RAISE EXCEPTION 'curriculum enrollment placement is immutable after activation';
    END IF;
    NEW.enrolled_at := now();
    NEW.ended_at := NULL;
    RETURN NEW;
  END IF;

  IF v_placement_changed THEN
    RAISE EXCEPTION 'curriculum enrollment placement is immutable after activation';
  END IF;

  IF OLD.status = 'active' THEN
    IF NEW.status NOT IN ('completed','transferred','withdrawn') THEN
      RAISE EXCEPTION 'curriculum enrollment lifecycle violation';
    END IF;
    NEW.enrolled_at := OLD.enrolled_at;
    NEW.ended_at := now();
    RETURN NEW;
  END IF;

  -- completed / transferred / withdrawn: archival only, business fields frozen.
  IF NEW.status <> 'archived' THEN
    RAISE EXCEPTION 'curriculum enrollment lifecycle violation';
  END IF;
  NEW.enrolled_at := OLD.enrolled_at;
  NEW.ended_at := OLD.ended_at;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER curriculum_enrollments_enforce_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.curriculum_enrollments
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_enrollment_lifecycle();

REVOKE ALL ON FUNCTION app_private.enforce_curriculum_enrollment_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_enrollment_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_enrollment_lifecycle() FROM authenticated;

-- Cross-record consistency. No curriculum-version or academic-level mapping is
-- invented: only relationships the existing schema already expresses.
CREATE FUNCTION app_private.enforce_curriculum_enrollment_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_student_org uuid;
  v_period_org uuid;
  v_source_student uuid;
  v_cursor uuid;
  v_hops int := 0;
BEGIN
  SELECT s.organization_id INTO v_student_org
    FROM public.students s WHERE s.id = NEW.student_id;
  IF v_student_org IS NULL THEN
    RAISE EXCEPTION 'curriculum enrollment student not found';
  END IF;

  IF NEW.academic_period_id IS NOT NULL THEN
    SELECT p.organization_id INTO v_period_org
      FROM public.academic_periods p WHERE p.id = NEW.academic_period_id;
    IF v_period_org IS NULL OR v_period_org <> v_student_org THEN
      RAISE EXCEPTION 'academic period must belong to the student organization';
    END IF;
  END IF;

  IF NEW.transferred_from_enrollment_id IS NOT NULL THEN
    IF NEW.transferred_from_enrollment_id = NEW.id THEN
      RAISE EXCEPTION 'curriculum enrollment transfer cycle violation';
    END IF;
    SELECT e.student_id INTO v_source_student
      FROM public.curriculum_enrollments e WHERE e.id = NEW.transferred_from_enrollment_id;
    IF v_source_student IS NULL OR v_source_student <> NEW.student_id THEN
      RAISE EXCEPTION 'transferred-from enrollment must belong to the same student';
    END IF;

    v_cursor := NEW.transferred_from_enrollment_id;
    WHILE v_cursor IS NOT NULL LOOP
      v_hops := v_hops + 1;
      IF v_cursor = NEW.id THEN
        RAISE EXCEPTION 'curriculum enrollment transfer cycle violation';
      END IF;
      IF v_hops > 64 THEN
        RAISE EXCEPTION 'curriculum enrollment transfer chain limit exceeded';
      END IF;
      SELECT e.transferred_from_enrollment_id INTO v_cursor
        FROM public.curriculum_enrollments e WHERE e.id = v_cursor;
    END LOOP;
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER curriculum_enrollments_enforce_consistency
  BEFORE INSERT OR UPDATE ON public.curriculum_enrollments
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_enrollment_consistency();

REVOKE ALL ON FUNCTION app_private.enforce_curriculum_enrollment_consistency() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_enrollment_consistency() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_enrollment_consistency() FROM authenticated;

REVOKE ALL ON TABLE public.curriculum_enrollments FROM PUBLIC;
REVOKE ALL ON TABLE public.curriculum_enrollments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_enrollments TO authenticated;
GRANT ALL ON public.curriculum_enrollments TO service_role;

ALTER TABLE public.curriculum_enrollments ENABLE ROW LEVEL SECURITY;

-- Read: the authoritative existing viewer predicate (platform admin, tenant
-- org_admin, the Student's own account, and active parent/teacher/tutor
-- relationships). No alternate relationship semantics are invented.
CREATE POLICY curriculum_enrollments_select ON public.curriculum_enrollments
  FOR SELECT TO authenticated
  USING (app_private.can_view_student(student_id));

-- Write: Platform Administrator, or an active Organization Administrator of the
-- Student's organization. Parents, Students, Teachers and Tutors have no write
-- path unless independently holding org_admin authority.
CREATE POLICY curriculum_enrollments_insert ON public.curriculum_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.id = curriculum_enrollments.student_id
         AND app_private.has_org_role(s.organization_id, 'org_admin')
    )
  );

CREATE POLICY curriculum_enrollments_update ON public.curriculum_enrollments
  FOR UPDATE TO authenticated
  USING (
    app_private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.id = curriculum_enrollments.student_id
         AND app_private.has_org_role(s.organization_id, 'org_admin')
    )
  )
  WITH CHECK (
    app_private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.id = curriculum_enrollments.student_id
         AND app_private.has_org_role(s.organization_id, 'org_admin')
    )
  );

CREATE POLICY curriculum_enrollments_delete ON public.curriculum_enrollments
  FOR DELETE TO authenticated
  USING (
    app_private.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.students s
       WHERE s.id = curriculum_enrollments.student_id
         AND app_private.has_org_role(s.organization_id, 'org_admin')
    )
  );

-- ----------------------------- 4. student_curriculum_assignments bridge
-- Additive and intentionally NOT backfilled: no deterministic mapping exists
-- between historical subject assignments and Stage 1C enrollments.
ALTER TABLE public.student_curriculum_assignments
  ADD COLUMN curriculum_enrollment_id uuid NULL;

ALTER TABLE public.student_curriculum_assignments
  ADD CONSTRAINT student_curriculum_assignments_curriculum_enrollment_id_fkey
  FOREIGN KEY (curriculum_enrollment_id) REFERENCES public.curriculum_enrollments(id)
  ON DELETE SET NULL ON UPDATE RESTRICT;

CREATE INDEX student_curriculum_assignments_curriculum_enrollment_id_idx
  ON public.student_curriculum_assignments (curriculum_enrollment_id);

-- A non-null bridge may only reference an enrollment for the same Student.
CREATE FUNCTION app_private.enforce_assignment_enrollment_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_enrollment_student uuid;
BEGIN
  IF NEW.curriculum_enrollment_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT e.student_id INTO v_enrollment_student
    FROM public.curriculum_enrollments e WHERE e.id = NEW.curriculum_enrollment_id;
  IF v_enrollment_student IS NULL OR v_enrollment_student <> NEW.student_id THEN
    RAISE EXCEPTION 'assignment enrollment must belong to the same student';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER student_curriculum_assignments_enforce_enrollment_student
  BEFORE INSERT OR UPDATE ON public.student_curriculum_assignments
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_assignment_enrollment_student();

REVOKE ALL ON FUNCTION app_private.enforce_assignment_enrollment_student() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_assignment_enrollment_student() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_assignment_enrollment_student() FROM authenticated;

-- ------------------------------------------------------- 5. postconditions
DO $$
DECLARE
  v_count int;
BEGIN
  IF to_regclass('public.academic_periods') IS NULL
     OR to_regclass('public.curriculum_enrollments') IS NULL THEN
    RAISE EXCEPTION 'Postcondition failed: a Stage 1C table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'academic_periods' AND c.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'curriculum_enrollments' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Postcondition failed: RLS not enabled on a Stage 1C table';
  END IF;

  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'academic_periods';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Postcondition failed: expected 4 academic_periods policies, found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'curriculum_enrollments';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Postcondition failed: expected 4 curriculum_enrollments policies, found %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN ('academic_periods','curriculum_enrollments')
       AND (coalesce(qual,'') || coalesce(with_check,'')) ILIKE '%has_aal2%'
  ) THEN
    RAISE EXCEPTION 'Postcondition failed: SEC-006 stage two partially activated';
  END IF;

  IF has_table_privilege('anon', 'public.academic_periods', 'SELECT')
     OR has_table_privilege('anon', 'public.curriculum_enrollments', 'SELECT')
     OR has_table_privilege('anon', 'public.academic_periods', 'INSERT')
     OR has_table_privilege('anon', 'public.curriculum_enrollments', 'INSERT') THEN
    RAISE EXCEPTION 'Postcondition failed: anon retains Stage 1C table privileges';
  END IF;

  IF to_regprocedure('app_private.can_administer_academic_period(uuid)') IS NULL
     OR to_regprocedure('app_private.enforce_academic_period_hierarchy()') IS NULL
     OR to_regprocedure('app_private.enforce_curriculum_enrollment_lifecycle()') IS NULL
     OR to_regprocedure('app_private.enforce_curriculum_enrollment_consistency()') IS NULL
     OR to_regprocedure('app_private.enforce_assignment_enrollment_student()') IS NULL THEN
    RAISE EXCEPTION 'Postcondition failed: a Stage 1C helper is missing';
  END IF;

  SELECT count(*) INTO v_count FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname IN ('academic_periods','curriculum_enrollments')
     AND NOT t.tgisinternal;
  IF v_count <> 5 THEN
    RAISE EXCEPTION 'Postcondition failed: expected 5 Stage 1C triggers, found %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'curriculum_enrollments_one_active_primary'
  ) THEN
    RAISE EXCEPTION 'Postcondition failed: one-active-primary index missing';
  END IF;

  -- The bridge exists but stays entirely unpopulated.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'student_curriculum_assignments'
       AND column_name = 'curriculum_enrollment_id'
  ) THEN
    RAISE EXCEPTION 'Postcondition failed: assignment bridge column missing';
  END IF;
  SELECT count(*) INTO v_count FROM public.student_curriculum_assignments
   WHERE curriculum_enrollment_id IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Postcondition failed: assignment bridge was backfilled';
  END IF;

  SELECT count(*) INTO v_count FROM public.curriculum_enrollments;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Postcondition failed: enrollment rows were seeded';
  END IF;
  SELECT count(*) INTO v_count FROM public.academic_periods;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Postcondition failed: academic period rows were seeded';
  END IF;

  -- Stage 1A/1B objects preserved.
  IF to_regclass('public.curriculum_nodes') IS NULL
     OR to_regclass('public.learning_resources') IS NULL
     OR to_regclass('public.curriculum_providers') IS NULL
     OR to_regclass('public.education_stages') IS NULL
     OR to_regclass('public.subject_groups') IS NULL THEN
    RAISE EXCEPTION 'Postcondition failed: a Stage 1A/1B object was lost';
  END IF;
  IF to_regprocedure('app_private.has_aal2()') IS NOT NULL THEN
    RAISE EXCEPTION 'Postcondition failed: SEC-006 stage two became applied';
  END IF;
END
$$;

COMMIT;
