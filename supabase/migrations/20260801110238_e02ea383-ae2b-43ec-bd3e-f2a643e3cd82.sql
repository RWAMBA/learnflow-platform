-- 1. Learning pathways: publishing workflow + authoring
ALTER TABLE public.pathways
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS authoring_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.pathways SET published_at = coalesce(published_at, created_at) WHERE status = 'published';

DROP TRIGGER IF EXISTS pathways_set_updated_at ON public.pathways;
CREATE TRIGGER pathways_set_updated_at BEFORE UPDATE ON public.pathways
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS pathways_select ON public.pathways;
CREATE POLICY pathways_select ON public.pathways FOR SELECT TO authenticated
  USING (status = 'published' OR authoring_organization_id IN (SELECT app_private.auth_organization_ids()));

DROP POLICY IF EXISTS pathways_insert ON public.pathways;
CREATE POLICY pathways_insert ON public.pathways FOR INSERT TO authenticated
  WITH CHECK (app_private.can_author_curriculum(authoring_organization_id));

DROP POLICY IF EXISTS pathways_update ON public.pathways;
CREATE POLICY pathways_update ON public.pathways FOR UPDATE TO authenticated
  USING (app_private.can_author_curriculum(authoring_organization_id))
  WITH CHECK (app_private.can_author_curriculum(authoring_organization_id));

DROP POLICY IF EXISTS pathways_delete ON public.pathways;
CREATE POLICY pathways_delete ON public.pathways FOR DELETE TO authenticated
  USING (app_private.can_author_curriculum(authoring_organization_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pathways TO authenticated;
GRANT ALL ON public.pathways TO service_role;

-- 2. Full-text search across subjects, topics and lessons
ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english',
    coalesce(name, '') || ' ' || coalesce(code, '') || ' ' || coalesce(description, ''))) STORED;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(description, ''))) STORED;
ALTER TABLE public.lessons ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(content_body ->> 'body', ''))) STORED;

CREATE INDEX IF NOT EXISTS subjects_search_idx ON public.subjects USING gin (search_vector);
CREATE INDEX IF NOT EXISTS topics_search_idx ON public.topics USING gin (search_vector);
CREATE INDEX IF NOT EXISTS lessons_search_idx ON public.lessons USING gin (search_vector);

CREATE OR REPLACE FUNCTION public.search_curriculum(
  p_term text DEFAULT '',
  p_grade_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_content_type text DEFAULT NULL,
  p_kinds text[] DEFAULT ARRAY['subject','topic','lesson'],
  p_limit integer DEFAULT 10,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  kind text,
  id uuid,
  title text,
  subtitle text,
  status text,
  content_type text,
  subject_id uuid,
  grade_id uuid,
  grade_name text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT CASE WHEN coalesce(trim(p_term), '') = '' THEN NULL
                ELSE websearch_to_tsquery('english', trim(p_term)) END AS tsq,
           CASE WHEN coalesce(trim(p_term), '') = '' THEN NULL
                ELSE '%' || trim(p_term) || '%' END AS pat
  ),
  rows AS (
    SELECT 'subject'::text AS kind, s.id, s.name AS title, g.name AS subtitle,
           s.status, NULL::text AS content_type, s.id AS subject_id, g.id AS grade_id, g.name AS grade_name
    FROM public.subjects s
    JOIN public.grades g ON g.id = s.grade_id, q
    WHERE 'subject' = ANY(p_kinds)
      AND (q.tsq IS NULL OR s.search_vector @@ q.tsq OR s.name ILIKE q.pat)
      AND (p_grade_id IS NULL OR s.grade_id = p_grade_id)
      AND (p_status IS NULL OR s.status = p_status)
      AND p_content_type IS NULL
    UNION ALL
    SELECT 'topic'::text, t.id, t.title, s.name, t.status, NULL::text, s.id, g.id, g.name
    FROM public.topics t
    JOIN public.subjects s ON s.id = t.subject_id
    JOIN public.grades g ON g.id = s.grade_id, q
    WHERE 'topic' = ANY(p_kinds)
      AND (q.tsq IS NULL OR t.search_vector @@ q.tsq OR t.title ILIKE q.pat)
      AND (p_grade_id IS NULL OR s.grade_id = p_grade_id)
      AND (p_status IS NULL OR t.status = p_status)
      AND p_content_type IS NULL
    UNION ALL
    SELECT 'lesson'::text, l.id, l.title, s.name, l.status, l.content_type, s.id, g.id, g.name
    FROM public.lessons l
    JOIN public.subjects s ON s.id = l.subject_id
    JOIN public.grades g ON g.id = s.grade_id, q
    WHERE 'lesson' = ANY(p_kinds)
      AND (q.tsq IS NULL OR l.search_vector @@ q.tsq OR l.title ILIKE q.pat)
      AND (p_grade_id IS NULL OR s.grade_id = p_grade_id)
      AND (p_status IS NULL OR l.status = p_status)
      AND (p_content_type IS NULL OR l.content_type = p_content_type)
  )
  SELECT r.kind, r.id, r.title, r.subtitle, r.status, r.content_type, r.subject_id,
         r.grade_id, r.grade_name, count(*) OVER () AS total_count
  FROM rows r
  ORDER BY r.kind, r.title
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.search_curriculum(text, uuid, text, text, text[], integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.search_curriculum(text, uuid, text, text, text[], integer, integer) TO authenticated;

-- 3. Progress tracking capture points
ALTER TABLE public.progress_records
  ADD COLUMN IF NOT EXISTS lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS progress_records_student_idx ON public.progress_records (student_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS progress_records_lesson_idx ON public.progress_records (lesson_id);