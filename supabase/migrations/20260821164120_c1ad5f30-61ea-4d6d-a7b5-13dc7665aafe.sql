-- Stage 2 — Programmes. Additive, fail-closed.

-- ============ programmes ============
CREATE TABLE public.programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_type text NOT NULL DEFAULT 'tenant' CHECK (author_type IN ('platform','tenant')),
  authoring_organization_id uuid REFERENCES public.organizations(id),
  name text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 160),
  description text CHECK (description IS NULL OR length(description) <= 4000),
  category text NOT NULL CHECK (category IN (
    'academic','language','arts','music','stem','sport','technology','life_skills','enrichment')),
  subject_id uuid REFERENCES public.subjects(id),
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  schedule_description text CHECK (schedule_description IS NULL OR length(schedule_description) <= 1000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programmes_ownership_ck CHECK (
    (author_type = 'tenant' AND authoring_organization_id IS NOT NULL)
    OR (author_type = 'platform' AND authoring_organization_id IS NULL)
  )
);
CREATE INDEX programmes_org_status_idx ON public.programmes (organization_id, status);
CREATE INDEX programmes_subject_idx ON public.programmes (subject_id);

GRANT SELECT, INSERT, UPDATE ON public.programmes TO authenticated;
GRANT ALL ON public.programmes TO service_role;
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;

-- ============ programme_instructors ============
CREATE TABLE public.programme_instructors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_id uuid NOT NULL REFERENCES public.programmes(id) ON DELETE CASCADE,
  user_role_id uuid NOT NULL REFERENCES public.user_roles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programme_instructors_ended_ck CHECK (
    (status = 'active' AND ended_at IS NULL) OR (status = 'ended' AND ended_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX programme_instructors_one_active_idx
  ON public.programme_instructors (programme_id, user_role_id) WHERE status = 'active';
CREATE INDEX programme_instructors_role_idx ON public.programme_instructors (user_role_id, status);

GRANT SELECT, INSERT, UPDATE ON public.programme_instructors TO authenticated;
GRANT ALL ON public.programme_instructors TO service_role;
ALTER TABLE public.programme_instructors ENABLE ROW LEVEL SECURITY;

-- ============ programme_enrollments ============
CREATE TABLE public.programme_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_id uuid NOT NULL REFERENCES public.programmes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled','active','completed','withdrawn','archived')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  completed_at timestamptz,
  withdrawn_at timestamptz,
  archived_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX programme_enrollments_one_current_idx
  ON public.programme_enrollments (programme_id, student_id)
  WHERE status IN ('enrolled','active');
CREATE INDEX programme_enrollments_student_idx ON public.programme_enrollments (student_id, status);
CREATE INDEX programme_enrollments_programme_idx ON public.programme_enrollments (programme_id, status);

GRANT SELECT, INSERT, UPDATE ON public.programme_enrollments TO authenticated;
GRANT ALL ON public.programme_enrollments TO service_role;
ALTER TABLE public.programme_enrollments ENABLE ROW LEVEL SECURITY;

-- ============ helpers ============
CREATE OR REPLACE FUNCTION app_private.programme_organization(p_programme_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.organization_id FROM public.programmes p WHERE p.id = p_programme_id;
$$;

CREATE OR REPLACE FUNCTION app_private.can_manage_programmes(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.is_platform_admin() OR app_private.has_org_role(p_org_id, 'org_admin');
$$;

CREATE OR REPLACE FUNCTION app_private.programme_occupied_count(p_programme_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.programme_enrollments e
  WHERE e.programme_id = p_programme_id AND e.status IN ('enrolled','active');
$$;

-- Assigned-instructor test used by both RLS and the enrollment RPC.
CREATE OR REPLACE FUNCTION app_private.is_programme_instructor(p_programme_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.programme_instructors pi
    JOIN public.user_roles ur ON ur.id = pi.user_role_id
    JOIN public.roles r ON r.id = ur.role_id
    JOIN public.organization_memberships om
      ON om.user_id = ur.user_id AND om.organization_id = ur.organization_id
    WHERE pi.programme_id = p_programme_id
      AND pi.status = 'active'
      AND ur.user_id = auth.uid()
      AND ur.status = 'active'
      AND om.status = 'active'
      AND r.code IN ('teacher','tutor')
  );
$$;

-- The three authorized enrollment-creation paths, ANDed with tenant consistency.
CREATE OR REPLACE FUNCTION app_private.can_enroll_in_programme(p_programme_id uuid, p_student_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_org uuid;
  v_status text;
  v_student_org uuid;
BEGIN
  SELECT p.organization_id, p.status INTO v_org, v_status
    FROM public.programmes p WHERE p.id = p_programme_id;
  IF v_org IS NULL OR v_status <> 'published' THEN RETURN false; END IF;

  SELECT s.organization_id INTO v_student_org FROM public.students s WHERE s.id = p_student_id;
  IF v_student_org IS NULL OR v_student_org <> v_org THEN RETURN false; END IF;

  -- 1. Organization Administrator of that exact tenant.
  IF app_private.has_org_role(v_org, 'org_admin') THEN RETURN true; END IF;

  -- 2. Full-management Parent/Guardian of that linked learner.
  IF EXISTS (
    SELECT 1 FROM public.parent_student_relationships r
    WHERE r.student_id = p_student_id
      AND r.parent_id = auth.uid()
      AND r.status = 'active'
      AND r.permission_level = 'full_management'
      AND r.organization_id = v_org
  ) THEN RETURN true; END IF;

  -- 3. Assigned instructor AND an existing active relationship with that learner.
  IF app_private.is_programme_instructor(p_programme_id) AND EXISTS (
    SELECT 1 FROM public.teacher_student_relationships t
    WHERE t.student_id = p_student_id AND t.teacher_id = auth.uid()
      AND t.status = 'active' AND t.organization_id = v_org
    UNION ALL
    SELECT 1 FROM public.tutor_student_relationships t
    WHERE t.student_id = p_student_id AND t.tutor_id = auth.uid()
      AND t.status = 'active' AND t.organization_id = v_org
  ) THEN RETURN true; END IF;

  RETURN false;
END
$$;

REVOKE ALL ON FUNCTION app_private.programme_organization(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.can_manage_programmes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.programme_occupied_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.is_programme_instructor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.can_enroll_in_programme(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ============ validation triggers ============
CREATE OR REPLACE FUNCTION app_private.validate_programme()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_occupied integer;
BEGIN
  IF NEW.author_type = 'tenant' AND NEW.authoring_organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'A tenant programme must be authored by its own organization';
  END IF;

  IF NEW.subject_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.subjects s
      WHERE s.id = NEW.subject_id
        AND s.status = 'published'
        AND (s.authoring_organization_id IS NULL OR s.authoring_organization_id = NEW.organization_id)
    ) THEN
      RAISE EXCEPTION 'That subject is not an available school-level subject for this organization';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.organization_id <> OLD.organization_id
       OR NEW.author_type <> OLD.author_type
       OR NEW.authoring_organization_id IS DISTINCT FROM OLD.authoring_organization_id THEN
      RAISE EXCEPTION 'Programme ownership is immutable';
    END IF;
    IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
      RAISE EXCEPTION 'An archived programme cannot be reopened';
    END IF;
    IF NEW.capacity IS NOT NULL THEN
      v_occupied := app_private.programme_occupied_count(NEW.id);
      IF NEW.capacity < v_occupied THEN
        RAISE EXCEPTION 'Capacity cannot be reduced below the % learner(s) already enrolled', v_occupied;
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER programmes_validate BEFORE INSERT OR UPDATE ON public.programmes
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_programme();

CREATE OR REPLACE FUNCTION app_private.validate_programme_instructor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_prog_org uuid; v_role_org uuid; v_code text; v_role_status text; v_role_user uuid;
BEGIN
  SELECT p.organization_id INTO v_prog_org FROM public.programmes p WHERE p.id = NEW.programme_id;
  IF v_prog_org IS NULL THEN RAISE EXCEPTION 'That programme does not exist'; END IF;
  IF NEW.organization_id <> v_prog_org THEN
    RAISE EXCEPTION 'Instructor assignment must belong to the programme organization';
  END IF;

  SELECT ur.organization_id, r.code, ur.status, ur.user_id
    INTO v_role_org, v_code, v_role_status, v_role_user
    FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
   WHERE ur.id = NEW.user_role_id;
  IF v_role_org IS NULL THEN RAISE EXCEPTION 'That user role does not exist'; END IF;
  IF v_role_org <> v_prog_org THEN RAISE EXCEPTION 'Cross-tenant instructor assignment is not allowed'; END IF;
  IF v_code NOT IN ('teacher','tutor') THEN RAISE EXCEPTION 'Only a Teacher or Tutor may instruct a programme'; END IF;
  IF v_role_status <> 'active' THEN RAISE EXCEPTION 'That Teacher or Tutor role is not active'; END IF;

  IF TG_OP = 'INSERT' AND v_role_user = auth.uid() AND NOT app_private.is_platform_admin() THEN
    IF NOT app_private.has_org_role(v_prog_org, 'org_admin') THEN
      RAISE EXCEPTION 'Instructors cannot assign themselves to a programme';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.programme_id <> OLD.programme_id OR NEW.user_role_id <> OLD.user_role_id THEN
      RAISE EXCEPTION 'An instructor assignment cannot be re-pointed';
    END IF;
    IF OLD.status = 'ended' AND NEW.status <> 'ended' THEN
      RAISE EXCEPTION 'An ended instructor assignment cannot be reactivated';
    END IF;
  END IF;

  IF NEW.status = 'ended' AND NEW.ended_at IS NULL THEN NEW.ended_at := now(); END IF;
  IF NEW.status = 'active' THEN NEW.ended_at := NULL; END IF;

  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER programme_instructors_validate BEFORE INSERT OR UPDATE ON public.programme_instructors
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_programme_instructor();

CREATE OR REPLACE FUNCTION app_private.enforce_programme_enrollment_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_prog_org uuid; v_prog_status text; v_student_org uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT p.organization_id, p.status INTO v_prog_org, v_prog_status
      FROM public.programmes p WHERE p.id = NEW.programme_id;
    IF v_prog_org IS NULL THEN RAISE EXCEPTION 'That programme does not exist'; END IF;
    IF v_prog_status <> 'published' THEN
      RAISE EXCEPTION 'Only a published programme can accept enrollments';
    END IF;
    SELECT s.organization_id INTO v_student_org FROM public.students s WHERE s.id = NEW.student_id;
    IF v_student_org IS NULL OR v_student_org <> v_prog_org THEN
      RAISE EXCEPTION 'Learner and programme must belong to the same organization';
    END IF;
    IF NEW.organization_id <> v_prog_org THEN
      RAISE EXCEPTION 'Enrollment organization must match the programme organization';
    END IF;
    IF NEW.status <> 'enrolled' THEN
      RAISE EXCEPTION 'A new programme enrollment must start as enrolled';
    END IF;
  ELSE
    IF NEW.programme_id <> OLD.programme_id
       OR NEW.student_id <> OLD.student_id
       OR NEW.organization_id <> OLD.organization_id THEN
      RAISE EXCEPTION 'A programme enrollment cannot be re-pointed';
    END IF;
    IF NEW.status <> OLD.status THEN
      IF NOT (
        (OLD.status = 'enrolled'  AND NEW.status IN ('active','withdrawn'))
        OR (OLD.status = 'active'    AND NEW.status IN ('completed','withdrawn'))
        OR (OLD.status = 'completed' AND NEW.status = 'archived')
        OR (OLD.status = 'withdrawn' AND NEW.status = 'archived')
      ) THEN
        RAISE EXCEPTION 'Invalid programme enrollment transition: % -> %', OLD.status, NEW.status;
      END IF;
      IF NEW.status = 'active'    THEN NEW.activated_at := now(); END IF;
      IF NEW.status = 'completed' THEN NEW.completed_at := now(); END IF;
      IF NEW.status = 'withdrawn' THEN NEW.withdrawn_at := now(); END IF;
      IF NEW.status = 'archived'  THEN NEW.archived_at  := now(); END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.updated_by := auth.uid(); END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER programme_enrollments_lifecycle BEFORE INSERT OR UPDATE ON public.programme_enrollments
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_programme_enrollment_lifecycle();

-- Deletion is never permitted: history is preserved.
CREATE OR REPLACE FUNCTION app_private.reject_programme_history_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'Programme history cannot be deleted; archive it instead';
END
$$;

CREATE TRIGGER programme_instructors_no_delete BEFORE DELETE ON public.programme_instructors
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_programme_history_delete();
CREATE TRIGGER programme_enrollments_no_delete BEFORE DELETE ON public.programme_enrollments
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_programme_history_delete();

-- ============ audit ============
CREATE OR REPLACE FUNCTION app_private.log_programme_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_org uuid;
BEGIN
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);
  INSERT INTO public.audit_logs (actor_user_id, organization_id, action, entity_type, entity_id,
                                 before_state, after_state)
  VALUES (
    auth.uid(), v_org,
    TG_TABLE_NAME || '.' || lower(TG_OP), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NULL;
END
$$;

CREATE TRIGGER programmes_audit AFTER INSERT OR UPDATE ON public.programmes
  FOR EACH ROW EXECUTE FUNCTION app_private.log_programme_change();
CREATE TRIGGER programme_instructors_audit AFTER INSERT OR UPDATE ON public.programme_instructors
  FOR EACH ROW EXECUTE FUNCTION app_private.log_programme_change();
CREATE TRIGGER programme_enrollments_audit AFTER INSERT OR UPDATE ON public.programme_enrollments
  FOR EACH ROW EXECUTE FUNCTION app_private.log_programme_change();

REVOKE ALL ON FUNCTION app_private.validate_programme() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.validate_programme_instructor() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.enforce_programme_enrollment_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.reject_programme_history_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION app_private.log_programme_change() FROM PUBLIC, anon, authenticated;

-- ============ RLS policies ============
CREATE POLICY programmes_select ON public.programmes
  FOR SELECT TO authenticated
  USING (
    app_private.is_platform_admin()
    OR (app_private.is_org_member(organization_id)
        AND (status = 'published' OR app_private.has_org_role(organization_id, 'org_admin')))
  );

CREATE POLICY programmes_insert ON public.programmes
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_manage_programmes(organization_id));

CREATE POLICY programmes_update ON public.programmes
  FOR UPDATE TO authenticated
  USING (app_private.can_manage_programmes(organization_id))
  WITH CHECK (app_private.can_manage_programmes(organization_id));

CREATE POLICY programme_instructors_select ON public.programme_instructors
  FOR SELECT TO authenticated
  USING (app_private.is_platform_admin() OR app_private.is_org_member(organization_id));

CREATE POLICY programme_instructors_insert ON public.programme_instructors
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_manage_programmes(organization_id));

CREATE POLICY programme_instructors_update ON public.programme_instructors
  FOR UPDATE TO authenticated
  USING (app_private.can_manage_programmes(organization_id))
  WITH CHECK (app_private.can_manage_programmes(organization_id));

CREATE POLICY programme_enrollments_select ON public.programme_enrollments
  FOR SELECT TO authenticated
  USING (
    app_private.is_platform_admin()
    OR app_private.has_org_role(organization_id, 'org_admin')
    OR app_private.can_view_student(student_id)
  );

CREATE POLICY programme_enrollments_insert ON public.programme_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_enroll_in_programme(programme_id, student_id));

-- Lifecycle transitions are Organization Administrator only.
CREATE POLICY programme_enrollments_update ON public.programme_enrollments
  FOR UPDATE TO authenticated
  USING (app_private.can_manage_programmes(organization_id))
  WITH CHECK (app_private.can_manage_programmes(organization_id));

-- ============ atomic, capacity-safe enrollment ============
CREATE OR REPLACE FUNCTION public.enroll_student_in_programme(
  p_programme_id uuid,
  p_student_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_status text;
  v_capacity integer;
  v_occupied integer;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  -- Row lock serializes the capacity check with the insert.
  SELECT p.organization_id, p.status, p.capacity
    INTO v_org, v_status, v_capacity
    FROM public.programmes p
   WHERE p.id = p_programme_id
   FOR UPDATE;

  IF v_org IS NULL THEN RAISE EXCEPTION 'That programme does not exist'; END IF;
  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'Only a published programme can accept enrollments';
  END IF;

  IF NOT app_private.can_enroll_in_programme(p_programme_id, p_student_id) THEN
    RAISE EXCEPTION 'Not authorized to enroll this learner in this programme';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.programme_enrollments e
    WHERE e.programme_id = p_programme_id AND e.student_id = p_student_id
      AND e.status IN ('enrolled','active')
  ) THEN
    RAISE EXCEPTION 'That learner already has a current enrollment in this programme';
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_occupied FROM public.programme_enrollments e
     WHERE e.programme_id = p_programme_id AND e.status IN ('enrolled','active');
    IF v_occupied >= v_capacity THEN
      RAISE EXCEPTION 'This programme is full';
    END IF;
  END IF;

  INSERT INTO public.programme_enrollments (organization_id, programme_id, student_id, status, created_by)
  VALUES (v_org, p_programme_id, p_student_id, 'enrolled', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.enroll_student_in_programme(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_student_in_programme(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_programme_enrollment_status(
  p_enrollment_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_status NOT IN ('active','completed','withdrawn','archived') THEN
    RAISE EXCEPTION 'Unsupported programme enrollment status';
  END IF;

  SELECT e.organization_id INTO v_org FROM public.programme_enrollments e WHERE e.id = p_enrollment_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'That enrollment no longer exists'; END IF;
  IF NOT app_private.can_manage_programmes(v_org) THEN
    RAISE EXCEPTION 'Only an Organization Administrator may change a programme enrollment status';
  END IF;

  UPDATE public.programme_enrollments SET status = p_status WHERE id = p_enrollment_id;
END
$$;

REVOKE ALL ON FUNCTION public.set_programme_enrollment_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_programme_enrollment_status(uuid, text) TO authenticated;