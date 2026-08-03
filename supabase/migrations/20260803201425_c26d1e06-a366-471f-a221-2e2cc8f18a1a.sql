-- 1. Review status ------------------------------------------------------
ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_status_check;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_status_check CHECK (status = ANY (ARRAY['draft','review','published','archived']));
ALTER TABLE public.topics DROP CONSTRAINT IF EXISTS topics_status_check;
ALTER TABLE public.topics ADD CONSTRAINT topics_status_check CHECK (status = ANY (ARRAY['draft','review','published','archived']));
ALTER TABLE public.lessons DROP CONSTRAINT IF EXISTS lessons_status_check;
ALTER TABLE public.lessons ADD CONSTRAINT lessons_status_check CHECK (status = ANY (ARRAY['draft','review','published','archived']));
ALTER TABLE public.progress_records DROP CONSTRAINT IF EXISTS progress_records_mastery_level_check;
ALTER TABLE public.progress_records ADD CONSTRAINT progress_records_mastery_level_check CHECK (mastery_level = ANY (ARRAY['not_started','emerging','developing','proficient','advanced','mastered']));

-- 2. Curriculum versions -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curriculum_id uuid NOT NULL REFERENCES public.curricula(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE SET NULL,
  label text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','review','published','archived'])),
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curriculum_versions_curriculum_idx ON public.curriculum_versions(curriculum_id);
CREATE INDEX IF NOT EXISTS curriculum_versions_org_idx ON public.curriculum_versions(organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_versions TO authenticated;
GRANT ALL ON public.curriculum_versions TO service_role;
ALTER TABLE public.curriculum_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY curriculum_versions_select ON public.curriculum_versions FOR SELECT TO authenticated
  USING (status = 'published' OR organization_id IS NULL OR organization_id IN (SELECT app_private.auth_organization_ids()));
CREATE POLICY curriculum_versions_insert ON public.curriculum_versions FOR INSERT TO authenticated
  WITH CHECK (app_private.can_author_curriculum(organization_id));
CREATE POLICY curriculum_versions_update ON public.curriculum_versions FOR UPDATE TO authenticated
  USING (app_private.can_author_curriculum(organization_id))
  WITH CHECK (app_private.can_author_curriculum(organization_id));
CREATE POLICY curriculum_versions_delete ON public.curriculum_versions FOR DELETE TO authenticated
  USING (app_private.can_author_curriculum(organization_id));
CREATE TRIGGER curriculum_versions_set_updated_at BEFORE UPDATE ON public.curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Strands -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.strands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  curriculum_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  sequence_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','review','published','archived'])),
  authoring_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS strands_subject_idx ON public.strands(subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strands TO authenticated;
GRANT ALL ON public.strands TO service_role;
ALTER TABLE public.strands ENABLE ROW LEVEL SECURITY;
CREATE POLICY strands_select ON public.strands FOR SELECT TO authenticated
  USING (status = 'published' OR authoring_organization_id IN (SELECT app_private.auth_organization_ids()));
CREATE POLICY strands_insert ON public.strands FOR INSERT TO authenticated
  WITH CHECK (app_private.can_author_curriculum(authoring_organization_id));
CREATE POLICY strands_update ON public.strands FOR UPDATE TO authenticated
  USING (app_private.can_author_curriculum(authoring_organization_id))
  WITH CHECK (app_private.can_author_curriculum(authoring_organization_id));
CREATE POLICY strands_delete ON public.strands FOR DELETE TO authenticated
  USING (app_private.can_author_curriculum(authoring_organization_id));
CREATE TRIGGER strands_set_updated_at BEFORE UPDATE ON public.strands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Sub-strands ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sub_strands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strand_id uuid NOT NULL REFERENCES public.strands(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sequence_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','review','published','archived'])),
  authoring_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sub_strands_strand_idx ON public.sub_strands(strand_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_strands TO authenticated;
GRANT ALL ON public.sub_strands TO service_role;
ALTER TABLE public.sub_strands ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_strands_select ON public.sub_strands FOR SELECT TO authenticated
  USING (status = 'published' OR authoring_organization_id IN (SELECT app_private.auth_organization_ids()));
CREATE POLICY sub_strands_insert ON public.sub_strands FOR INSERT TO authenticated
  WITH CHECK (app_private.can_author_curriculum(authoring_organization_id));
CREATE POLICY sub_strands_update ON public.sub_strands FOR UPDATE TO authenticated
  USING (app_private.can_author_curriculum(authoring_organization_id))
  WITH CHECK (app_private.can_author_curriculum(authoring_organization_id));
CREATE POLICY sub_strands_delete ON public.sub_strands FOR DELETE TO authenticated
  USING (app_private.can_author_curriculum(authoring_organization_id));
CREATE TRIGGER sub_strands_set_updated_at BEFORE UPDATE ON public.sub_strands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Learning outcomes ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learning_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_strand_id uuid NOT NULL REFERENCES public.sub_strands(id) ON DELETE CASCADE,
  competency_id uuid REFERENCES public.competencies(id) ON DELETE SET NULL,
  description text NOT NULL,
  sequence_order integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY['draft','review','published','archived'])),
  authoring_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_outcomes_sub_strand_idx ON public.learning_outcomes(sub_strand_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_outcomes TO authenticated;
GRANT ALL ON public.learning_outcomes TO service_role;
ALTER TABLE public.learning_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY learning_outcomes_select ON public.learning_outcomes FOR SELECT TO authenticated
  USING (status = 'published' OR authoring_organization_id IN (SELECT app_private.auth_organization_ids()));
CREATE POLICY learning_outcomes_write ON public.learning_outcomes FOR ALL TO authenticated
  USING (app_private.can_author_curriculum(authoring_organization_id))
  WITH CHECK (app_private.can_author_curriculum(authoring_organization_id));
CREATE TRIGGER learning_outcomes_set_updated_at BEFORE UPDATE ON public.learning_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Lesson extensions ---------------------------------------------------
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS sub_strand_id uuid REFERENCES public.sub_strands(id) ON DELETE SET NULL;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS learning_outcome_id uuid REFERENCES public.learning_outcomes(id) ON DELETE SET NULL;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS curriculum_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE SET NULL;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS estimated_minutes integer;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS summary text;

CREATE TABLE IF NOT EXISTS public.lesson_prerequisites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  prerequisite_lesson_id uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, prerequisite_lesson_id),
  CHECK (lesson_id <> prerequisite_lesson_id)
);
CREATE INDEX IF NOT EXISTS lesson_prerequisites_lesson_idx ON public.lesson_prerequisites(lesson_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_prerequisites TO authenticated;
GRANT ALL ON public.lesson_prerequisites TO service_role;
ALTER TABLE public.lesson_prerequisites ENABLE ROW LEVEL SECURITY;
CREATE POLICY lesson_prerequisites_select ON public.lesson_prerequisites FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_prerequisites.lesson_id
    AND (l.status = 'published' OR l.authoring_organization_id IN (SELECT app_private.auth_organization_ids()))));
CREATE POLICY lesson_prerequisites_write ON public.lesson_prerequisites FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_prerequisites.lesson_id AND app_private.can_author_curriculum(l.authoring_organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = lesson_prerequisites.lesson_id AND app_private.can_author_curriculum(l.authoring_organization_id)));

-- 7. Curriculum resources ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.curriculum_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type = ANY (ARRAY['subject','strand','sub_strand','lesson','topic'])),
  entity_id uuid NOT NULL,
  resource_type text NOT NULL CHECK (resource_type = ANY (ARRAY['pdf','video','image','audio','link','document'])),
  title text NOT NULL,
  description text,
  url text,
  storage_path text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curriculum_resources_entity_idx ON public.curriculum_resources(entity_type, entity_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_resources TO authenticated;
GRANT ALL ON public.curriculum_resources TO service_role;
ALTER TABLE public.curriculum_resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY curriculum_resources_select ON public.curriculum_resources FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id IN (SELECT app_private.auth_organization_ids()));
CREATE POLICY curriculum_resources_write ON public.curriculum_resources FOR ALL TO authenticated
  USING (app_private.can_author_curriculum(organization_id))
  WITH CHECK (app_private.can_author_curriculum(organization_id));
CREATE TRIGGER curriculum_resources_set_updated_at BEFORE UPDATE ON public.curriculum_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();