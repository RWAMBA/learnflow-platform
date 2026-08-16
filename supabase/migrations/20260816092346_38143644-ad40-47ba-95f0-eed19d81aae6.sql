-- Phase 10 Stage 1A — Curriculum Foundation (schema only, additive, fail-closed)
-- Prepared for review. Contains no seed data and no destructive rename/drop of legacy structures.

BEGIN;

-- ---------------------------------------------------------------------------
-- H. FAIL-CLOSED PRECONDITION ASSERTIONS
-- ---------------------------------------------------------------------------
DO $precheck$
DECLARE
  v_count bigint;
BEGIN
  -- Required existing tables
  IF to_regclass('public.curricula') IS NULL
     OR to_regclass('public.curriculum_versions') IS NULL
     OR to_regclass('public.grades') IS NULL
     OR to_regclass('public.pathways') IS NULL
     OR to_regclass('public.subjects') IS NULL THEN
    RAISE EXCEPTION 'stage1a precondition failed: required base table missing';
  END IF;

  -- Required trigger helper function
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
      AND pg_get_function_result(p.oid) = 'trigger'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RAISE EXCEPTION 'stage1a precondition failed: public.set_updated_at() missing or wrong signature';
  END IF;

  -- Required authorization helper
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app_private' AND p.proname = 'is_platform_admin'
  ) THEN
    RAISE EXCEPTION 'stage1a precondition failed: authorization helper missing';
  END IF;

  -- New tables must not already exist
  IF to_regclass('public.curriculum_providers') IS NOT NULL
     OR to_regclass('public.education_stages') IS NOT NULL
     OR to_regclass('public.subject_groups') IS NOT NULL THEN
    RAISE EXCEPTION 'stage1a precondition failed: a stage 1A table already exists';
  END IF;

  -- New columns must not already exist
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND ( (table_name = 'curricula'           AND column_name = 'provider_id')
       OR (table_name = 'curriculum_versions' AND column_name = 'is_current')
       OR (table_name = 'grades'              AND column_name IN ('education_stage_id','status','published_at'))
       OR (table_name = 'subjects'            AND column_name IN ('academic_level_id','track_id','subject_group_id')) );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'stage1a precondition failed: a stage 1A column already exists';
  END IF;

  -- subjects.published_at is a documented pre-existing column; assert its expected shape
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects'
      AND column_name = 'published_at' AND data_type = 'timestamp with time zone'
      AND is_nullable = 'YES'
  ) THEN
    RAISE EXCEPTION 'stage1a precondition failed: subjects.published_at not in the expected shape';
  END IF;

  -- New constraints / indexes / triggers / function must not already exist
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN (
      'curriculum_providers_code_key','subject_groups_name_key',
      'education_stages_curriculum_version_id_fkey','education_stages_version_sequence_key','education_stages_status_chk',
      'curricula_provider_id_fkey','grades_education_stage_id_fkey','grades_status_chk',
      'subjects_academic_level_id_fkey','subjects_track_id_fkey','subjects_subject_group_id_fkey',
      'curriculum_versions_org_null_chk','curriculum_versions_current_published_chk')) THEN
    RAISE EXCEPTION 'stage1a precondition failed: a stage 1A constraint already exists';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname IN (
      'curricula_provider_id_idx','grades_education_stage_id_idx',
      'subjects_academic_level_id_idx','subjects_track_id_idx','subjects_subject_group_id_idx',
      'curriculum_versions_one_current_per_curriculum')) THEN
    RAISE EXCEPTION 'stage1a precondition failed: a stage 1A index already exists';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN (
      'curriculum_providers_set_updated_at','education_stages_set_updated_at',
      'subject_groups_set_updated_at','curriculum_versions_enforce_lifecycle')) THEN
    RAISE EXCEPTION 'stage1a precondition failed: a stage 1A trigger already exists';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'app_private' AND p.proname = 'enforce_curriculum_version_lifecycle') THEN
    RAISE EXCEPTION 'stage1a precondition failed: lifecycle function already exists';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND policyname IN (
      'curriculum_providers_select','curriculum_providers_write',
      'education_stages_select','education_stages_write',
      'subject_groups_select','subject_groups_write')) THEN
    RAISE EXCEPTION 'stage1a precondition failed: a stage 1A policy already exists';
  END IF;

  -- Existing curriculum_versions policy baseline (SEC-005) must match exactly
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'curriculum_versions';
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'stage1a precondition failed: unexpected curriculum_versions policy count';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='curriculum_versions'
    AND policyname='curriculum_versions_select' AND cmd='SELECT' AND roles = '{authenticated}'
    AND qual = '((organization_id IS NULL) AND ((status = ''published''::text) OR app_private.is_platform_admin()))')
  OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='curriculum_versions'
    AND policyname='curriculum_versions_insert' AND cmd='INSERT' AND roles = '{authenticated}'
    AND with_check = '((organization_id IS NULL) AND app_private.is_platform_admin())')
  OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='curriculum_versions'
    AND policyname='curriculum_versions_update' AND cmd='UPDATE' AND roles = '{authenticated}'
    AND qual = '((organization_id IS NULL) AND app_private.is_platform_admin())'
    AND with_check = '((organization_id IS NULL) AND app_private.is_platform_admin())')
  OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='curriculum_versions'
    AND policyname='curriculum_versions_delete' AND cmd='DELETE' AND roles = '{authenticated}'
    AND qual = '((organization_id IS NULL) AND app_private.is_platform_admin())')
  THEN
    RAISE EXCEPTION 'stage1a precondition failed: curriculum_versions policy baseline mismatch';
  END IF;

  -- Ownership disposition gate: no tenant-owned curriculum versions may exist
  SELECT count(*) INTO v_count FROM public.curriculum_versions WHERE organization_id IS NOT NULL;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'stage1a precondition failed: tenant-owned curriculum versions require data-disposition review';
  END IF;
END
$precheck$;

-- ---------------------------------------------------------------------------
-- A. public.curriculum_providers
-- ---------------------------------------------------------------------------
CREATE TABLE public.curriculum_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_providers_code_key UNIQUE (code)
);

CREATE TRIGGER curriculum_providers_set_updated_at
  BEFORE UPDATE ON public.curriculum_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- B. public.education_stages
-- ---------------------------------------------------------------------------
CREATE TABLE public.education_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_version_id uuid NOT NULL,
  name text NOT NULL,
  sequence_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT education_stages_curriculum_version_id_fkey
    FOREIGN KEY (curriculum_version_id) REFERENCES public.curriculum_versions(id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT education_stages_version_sequence_key UNIQUE (curriculum_version_id, sequence_order),
  CONSTRAINT education_stages_status_chk CHECK (status IN ('draft','review','published','archived'))
);

CREATE TRIGGER education_stages_set_updated_at
  BEFORE UPDATE ON public.education_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- C. public.subject_groups
-- ---------------------------------------------------------------------------
CREATE TABLE public.subject_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subject_groups_name_key UNIQUE (name)
);

CREATE TRIGGER subject_groups_set_updated_at
  BEFORE UPDATE ON public.subject_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- D. ACL AND RLS FOR THE THREE NEW TABLES
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.curriculum_providers FROM PUBLIC;
REVOKE ALL ON public.curriculum_providers FROM anon;
REVOKE ALL ON public.education_stages FROM PUBLIC;
REVOKE ALL ON public.education_stages FROM anon;
REVOKE ALL ON public.subject_groups FROM PUBLIC;
REVOKE ALL ON public.subject_groups FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.education_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_groups TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.curriculum_providers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.education_stages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subject_groups TO service_role;

ALTER TABLE public.curriculum_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY curriculum_providers_select ON public.curriculum_providers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY curriculum_providers_write ON public.curriculum_providers
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());

CREATE POLICY education_stages_select ON public.education_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY education_stages_write ON public.education_stages
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());

CREATE POLICY subject_groups_select ON public.subject_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY subject_groups_write ON public.subject_groups
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- E. ADDITIVE EXISTING-TABLE CHANGES
-- ---------------------------------------------------------------------------

-- public.curricula
ALTER TABLE public.curricula ADD COLUMN provider_id uuid;
ALTER TABLE public.curricula
  ADD CONSTRAINT curricula_provider_id_fkey
  FOREIGN KEY (provider_id) REFERENCES public.curriculum_providers(id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX curricula_provider_id_idx ON public.curricula(provider_id);

-- public.curriculum_versions
ALTER TABLE public.curriculum_versions ADD COLUMN is_current boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX curriculum_versions_one_current_per_curriculum
  ON public.curriculum_versions(curriculum_id) WHERE is_current;
ALTER TABLE public.curriculum_versions
  ADD CONSTRAINT curriculum_versions_org_null_chk CHECK (organization_id IS NULL);
ALTER TABLE public.curriculum_versions
  ADD CONSTRAINT curriculum_versions_current_published_chk
  CHECK (NOT is_current OR status = 'published');

-- public.grades
ALTER TABLE public.grades ADD COLUMN education_stage_id uuid;
ALTER TABLE public.grades
  ADD CONSTRAINT grades_education_stage_id_fkey
  FOREIGN KEY (education_stage_id) REFERENCES public.education_stages(id)
  ON DELETE SET NULL ON UPDATE RESTRICT;
CREATE INDEX grades_education_stage_id_idx ON public.grades(education_stage_id);

ALTER TABLE public.grades ADD COLUMN status text;
ALTER TABLE public.grades ADD COLUMN published_at timestamptz;
UPDATE public.grades SET status = 'published' WHERE status IS NULL;
ALTER TABLE public.grades ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.grades
  ADD CONSTRAINT grades_status_chk CHECK (status IN ('draft','review','published','archived')) NOT VALID;
ALTER TABLE public.grades VALIDATE CONSTRAINT grades_status_chk;
ALTER TABLE public.grades ALTER COLUMN status SET NOT NULL;

-- public.subjects
ALTER TABLE public.subjects ADD COLUMN academic_level_id uuid;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_academic_level_id_fkey
  FOREIGN KEY (academic_level_id) REFERENCES public.grades(id)
  ON DELETE SET NULL ON UPDATE RESTRICT;
CREATE INDEX subjects_academic_level_id_idx ON public.subjects(academic_level_id);

ALTER TABLE public.subjects ADD COLUMN track_id uuid;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_track_id_fkey
  FOREIGN KEY (track_id) REFERENCES public.pathways(id)
  ON DELETE SET NULL ON UPDATE RESTRICT;
CREATE INDEX subjects_track_id_idx ON public.subjects(track_id);

ALTER TABLE public.subjects ADD COLUMN subject_group_id uuid;
ALTER TABLE public.subjects
  ADD CONSTRAINT subjects_subject_group_id_fkey
  FOREIGN KEY (subject_group_id) REFERENCES public.subject_groups(id)
  ON DELETE SET NULL ON UPDATE RESTRICT;
CREATE INDEX subjects_subject_group_id_idx ON public.subjects(subject_group_id);

-- Structural copies only; no semantic backfill, no fabricated timestamps.
UPDATE public.subjects SET academic_level_id = grade_id;
UPDATE public.subjects SET track_id = pathway_id;

-- ---------------------------------------------------------------------------
-- F. RECONCILE curriculum_versions POLICIES
-- ---------------------------------------------------------------------------
DROP POLICY curriculum_versions_select ON public.curriculum_versions;
DROP POLICY curriculum_versions_insert ON public.curriculum_versions;
DROP POLICY curriculum_versions_update ON public.curriculum_versions;
DROP POLICY curriculum_versions_delete ON public.curriculum_versions;

CREATE POLICY curriculum_versions_select ON public.curriculum_versions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY curriculum_versions_insert ON public.curriculum_versions
  FOR INSERT TO authenticated
  WITH CHECK (app_private.is_platform_admin() AND organization_id IS NULL);

CREATE POLICY curriculum_versions_update ON public.curriculum_versions
  FOR UPDATE TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin() AND organization_id IS NULL);

CREATE POLICY curriculum_versions_delete ON public.curriculum_versions
  FOR DELETE TO authenticated
  USING (app_private.is_platform_admin());

-- ---------------------------------------------------------------------------
-- G. CURRICULUM VERSION LIFECYCLE ENFORCEMENT
-- ---------------------------------------------------------------------------
CREATE FUNCTION app_private.enforce_curriculum_version_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published','archived') THEN
      RAISE EXCEPTION 'curriculum version lifecycle violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'curriculum version lifecycle violation';
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status <> 'archived' THEN
      RAISE EXCEPTION 'curriculum version lifecycle violation';
    END IF;
    -- Status-only transition: every other field must be unchanged.
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.curriculum_id IS DISTINCT FROM OLD.curriculum_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.parent_version_id IS DISTINCT FROM OLD.parent_version_id
       OR NEW.label IS DISTINCT FROM OLD.label
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'curriculum version lifecycle violation';
    END IF;
    NEW.is_current := false;
    RETURN NEW;
  END IF;

  -- Draft and review rows follow existing authorized workflows, but may never
  -- move backward from a terminal state and may not be current unless published.
  IF NEW.status NOT IN ('draft','review','published','archived') THEN
    RAISE EXCEPTION 'curriculum version lifecycle violation';
  END IF;
  IF NEW.status = 'archived' THEN
    NEW.is_current := false;
  END IF;
  IF NEW.is_current AND NEW.status <> 'published' THEN
    RAISE EXCEPTION 'curriculum version lifecycle violation';
  END IF;

  RETURN NEW;
END
$fn$;

CREATE TRIGGER curriculum_versions_enforce_lifecycle
  BEFORE UPDATE OR DELETE ON public.curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_version_lifecycle();

REVOKE ALL ON FUNCTION app_private.enforce_curriculum_version_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_version_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_version_lifecycle() FROM authenticated;

COMMIT;