BEGIN;

-- ===========================================================================
-- Phase 10 Stage 1B — Content Spine Reconciliation (additive)
-- ===========================================================================

-- --------------------------------------------------------------- preconditions
DO $$
BEGIN
  IF to_regclass('public.curriculum_nodes') IS NOT NULL
     OR to_regclass('public.learning_resources') IS NOT NULL THEN
    RAISE EXCEPTION 'Precondition failed: Stage 1B tables already exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ( (table_name = 'lessons'              AND column_name = 'curriculum_node_id')
         OR (table_name = 'learning_objectives'  AND column_name = 'curriculum_node_id')
         OR (table_name = 'assessments'          AND column_name = 'learning_objective_id') )
  ) THEN
    RAISE EXCEPTION 'Precondition failed: Stage 1B compatibility columns already exist';
  END IF;
END
$$;

-- --------------------------------------------------------------- A. nodes
CREATE TABLE public.curriculum_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL,
  parent_node_id uuid,
  node_type text NOT NULL,
  title text NOT NULL,
  description text,
  sequence_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  authoring_organization_id uuid,
  curriculum_version_id uuid,
  legacy_source text,
  legacy_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_nodes_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE,
  CONSTRAINT curriculum_nodes_parent_node_id_fkey
    FOREIGN KEY (parent_node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE,
  CONSTRAINT curriculum_nodes_organization_fkey
    FOREIGN KEY (authoring_organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT curriculum_nodes_version_fkey
    FOREIGN KEY (curriculum_version_id) REFERENCES public.curriculum_versions(id) ON DELETE SET NULL,
  CONSTRAINT curriculum_nodes_status_chk
    CHECK (status IN ('draft','review','published','archived')),
  CONSTRAINT curriculum_nodes_node_type_chk
    CHECK (node_type IN ('strand','sub_strand','topic','unit','chapter')),
  CONSTRAINT curriculum_nodes_not_self_parent_chk
    CHECK (parent_node_id IS NULL OR parent_node_id <> id),
  CONSTRAINT curriculum_nodes_legacy_key UNIQUE (legacy_source, legacy_id)
);

CREATE INDEX curriculum_nodes_subject_id_idx ON public.curriculum_nodes(subject_id);
CREATE INDEX curriculum_nodes_parent_node_id_idx ON public.curriculum_nodes(parent_node_id);
CREATE INDEX curriculum_nodes_status_idx ON public.curriculum_nodes(status);

CREATE TRIGGER curriculum_nodes_set_updated_at
  BEFORE UPDATE ON public.curriculum_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- cycle + same-subject enforcement
CREATE FUNCTION app_private.enforce_curriculum_node_acyclic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_parent uuid;
  v_subject uuid;
  v_depth int := 0;
BEGIN
  IF NEW.parent_node_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_node_id = NEW.id THEN
    RAISE EXCEPTION 'curriculum node cycle violation';
  END IF;

  SELECT n.subject_id INTO v_subject
    FROM public.curriculum_nodes n WHERE n.id = NEW.parent_node_id;
  IF v_subject IS NULL OR v_subject <> NEW.subject_id THEN
    RAISE EXCEPTION 'curriculum node parent must belong to the same subject';
  END IF;

  v_parent := NEW.parent_node_id;
  WHILE v_parent IS NOT NULL LOOP
    v_depth := v_depth + 1;
    IF v_depth > 32 THEN
      RAISE EXCEPTION 'curriculum node depth limit exceeded';
    END IF;
    IF v_parent = NEW.id THEN
      RAISE EXCEPTION 'curriculum node cycle violation';
    END IF;
    SELECT n.parent_node_id INTO v_parent
      FROM public.curriculum_nodes n WHERE n.id = v_parent;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER curriculum_nodes_enforce_acyclic
  BEFORE INSERT OR UPDATE OF parent_node_id, subject_id ON public.curriculum_nodes
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_node_acyclic();

REVOKE ALL ON public.curriculum_nodes FROM PUBLIC;
REVOKE ALL ON public.curriculum_nodes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_nodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.curriculum_nodes TO service_role;

ALTER TABLE public.curriculum_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY curriculum_nodes_select ON public.curriculum_nodes
  FOR SELECT TO authenticated
  USING ((authoring_organization_id IS NULL)
         AND (status = 'published' OR app_private.is_platform_admin()));

CREATE POLICY curriculum_nodes_insert ON public.curriculum_nodes
  FOR INSERT TO authenticated
  WITH CHECK ((authoring_organization_id IS NULL) AND app_private.is_platform_admin());

CREATE POLICY curriculum_nodes_update ON public.curriculum_nodes
  FOR UPDATE TO authenticated
  USING ((authoring_organization_id IS NULL) AND app_private.is_platform_admin())
  WITH CHECK ((authoring_organization_id IS NULL) AND app_private.is_platform_admin());

CREATE POLICY curriculum_nodes_delete ON public.curriculum_nodes
  FOR DELETE TO authenticated
  USING ((authoring_organization_id IS NULL) AND app_private.is_platform_admin());

-- --------------------------------------------------------------- B. resources
CREATE TABLE public.learning_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid,
  curriculum_node_id uuid,
  resource_type text NOT NULL,
  title text NOT NULL,
  description text,
  url text,
  storage_path text,
  organization_id uuid,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  legacy_resource_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_resources_lesson_fkey
    FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE,
  CONSTRAINT learning_resources_node_fkey
    FOREIGN KEY (curriculum_node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE,
  CONSTRAINT learning_resources_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT,
  CONSTRAINT learning_resources_status_chk
    CHECK (status IN ('draft','review','published','archived')),
  CONSTRAINT learning_resources_type_chk
    CHECK (resource_type IN ('pdf','video','image','audio','link','document')),
  CONSTRAINT learning_resources_attachment_chk
    CHECK (num_nonnulls(lesson_id, curriculum_node_id) = 1),
  CONSTRAINT learning_resources_location_chk
    CHECK (num_nonnulls(url, storage_path) >= 1),
  CONSTRAINT learning_resources_legacy_key UNIQUE (legacy_resource_id)
);

CREATE INDEX learning_resources_lesson_idx ON public.learning_resources(lesson_id);
CREATE INDEX learning_resources_node_idx ON public.learning_resources(curriculum_node_id);
CREATE INDEX learning_resources_org_idx ON public.learning_resources(organization_id);

CREATE TRIGGER learning_resources_set_updated_at
  BEFORE UPDATE ON public.learning_resources
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION app_private.prevent_learning_resource_ownership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'learning resource ownership is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER learning_resources_ownership_immutable
  BEFORE UPDATE ON public.learning_resources
  FOR EACH ROW EXECUTE FUNCTION app_private.prevent_learning_resource_ownership_change();

REVOKE ALL ON public.learning_resources FROM PUBLIC;
REVOKE ALL ON public.learning_resources FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.learning_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.learning_resources TO service_role;

ALTER TABLE public.learning_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY learning_resources_select ON public.learning_resources
  FOR SELECT TO authenticated
  USING ((organization_id IS NULL)
         OR (organization_id IN (SELECT app_private.auth_organization_ids())));

CREATE POLICY learning_resources_write ON public.learning_resources
  FOR ALL TO authenticated
  USING (((organization_id IS NULL) AND app_private.is_platform_admin())
         OR app_private.can_author_curriculum(organization_id))
  WITH CHECK (((organization_id IS NULL) AND app_private.is_platform_admin())
         OR app_private.can_author_curriculum(organization_id));

-- --------------------------------------------------- C. compatibility columns
ALTER TABLE public.lessons ADD COLUMN curriculum_node_id uuid;
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_curriculum_node_fkey
  FOREIGN KEY (curriculum_node_id) REFERENCES public.curriculum_nodes(id) ON DELETE SET NULL;
CREATE INDEX lessons_curriculum_node_idx ON public.lessons(curriculum_node_id);

ALTER TABLE public.learning_objectives ADD COLUMN curriculum_node_id uuid;
ALTER TABLE public.learning_objectives
  ADD CONSTRAINT learning_objectives_curriculum_node_fkey
  FOREIGN KEY (curriculum_node_id) REFERENCES public.curriculum_nodes(id) ON DELETE CASCADE;
CREATE INDEX learning_objectives_curriculum_node_idx ON public.learning_objectives(curriculum_node_id);
ALTER TABLE public.learning_objectives ADD COLUMN legacy_outcome_id uuid;
ALTER TABLE public.learning_objectives
  ADD CONSTRAINT learning_objectives_legacy_outcome_key UNIQUE (legacy_outcome_id);
ALTER TABLE public.learning_objectives ALTER COLUMN lesson_id DROP NOT NULL;
ALTER TABLE public.learning_objectives
  ADD CONSTRAINT learning_objectives_attachment_chk
  CHECK (lesson_id IS NOT NULL OR curriculum_node_id IS NOT NULL) NOT VALID;
ALTER TABLE public.learning_objectives VALIDATE CONSTRAINT learning_objectives_attachment_chk;

ALTER TABLE public.assessments ADD COLUMN learning_objective_id uuid;
ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_learning_objective_fkey
  FOREIGN KEY (learning_objective_id) REFERENCES public.learning_objectives(id) ON DELETE SET NULL;
CREATE INDEX assessments_learning_objective_idx ON public.assessments(learning_objective_id);

-- ------------------------------------------------------------- D. backfill
-- Strands -> nodes
INSERT INTO public.curriculum_nodes
  (subject_id, parent_node_id, node_type, title, description, sequence_order,
   status, authoring_organization_id, curriculum_version_id, legacy_source, legacy_id, created_at)
SELECT s.subject_id, NULL, 'strand', s.title, s.description, s.sequence_order,
       s.status, s.authoring_organization_id, s.curriculum_version_id, 'strand', s.id, s.created_at
  FROM public.strands s;

-- Sub-strands -> nodes (parented to their strand node)
INSERT INTO public.curriculum_nodes
  (subject_id, parent_node_id, node_type, title, description, sequence_order,
   status, authoring_organization_id, curriculum_version_id, legacy_source, legacy_id, created_at)
SELECT pn.subject_id, pn.id, 'sub_strand', ss.title, ss.description, ss.sequence_order,
       ss.status, ss.authoring_organization_id, pn.curriculum_version_id, 'sub_strand', ss.id, ss.created_at
  FROM public.sub_strands ss
  JOIN public.curriculum_nodes pn
    ON pn.legacy_source = 'strand' AND pn.legacy_id = ss.strand_id;

-- Topics -> nodes
INSERT INTO public.curriculum_nodes
  (subject_id, parent_node_id, node_type, title, description, sequence_order,
   status, authoring_organization_id, legacy_source, legacy_id, created_at)
SELECT t.subject_id, NULL, 'topic', t.title, t.description, t.sequence_order,
       t.status, t.authoring_organization_id, 'topic', t.id, t.created_at
  FROM public.topics t;

-- Learning outcomes -> learning objectives (node-attached)
INSERT INTO public.learning_objectives
  (lesson_id, curriculum_node_id, competency_id, description, sequence_order, legacy_outcome_id, created_at)
SELECT NULL, n.id, lo.competency_id, lo.description, lo.sequence_order, lo.id, lo.created_at
  FROM public.learning_outcomes lo
  JOIN public.curriculum_nodes n
    ON n.legacy_source = 'sub_strand' AND n.legacy_id = lo.sub_strand_id;

-- Lessons -> nodes (sub-strand link wins, then topic)
UPDATE public.lessons l
   SET curriculum_node_id = n.id
  FROM public.curriculum_nodes n
 WHERE n.legacy_source = 'sub_strand' AND n.legacy_id = l.sub_strand_id;

UPDATE public.lessons l
   SET curriculum_node_id = n.id
  FROM public.curriculum_nodes n
 WHERE l.curriculum_node_id IS NULL
   AND n.legacy_source = 'topic' AND n.legacy_id = l.topic_id;

-- Curriculum resources -> learning resources
INSERT INTO public.learning_resources
  (lesson_id, curriculum_node_id, resource_type, title, description, url, storage_path,
   organization_id, status, published_at, legacy_resource_id, created_by, created_at)
SELECT
  CASE WHEN cr.entity_type = 'lesson' THEN cr.entity_id END,
  CASE WHEN cr.entity_type <> 'lesson' THEN n.id END,
  cr.resource_type, cr.title, cr.description, cr.url, cr.storage_path,
  cr.organization_id, 'published', cr.created_at, cr.id, cr.created_by, cr.created_at
  FROM public.curriculum_resources cr
  LEFT JOIN public.curriculum_nodes n
    ON n.legacy_source = cr.entity_type AND n.legacy_id = cr.entity_id
 WHERE (cr.entity_type = 'lesson' AND EXISTS (SELECT 1 FROM public.lessons l WHERE l.id = cr.entity_id))
    OR (cr.entity_type IN ('strand','sub_strand','topic') AND n.id IS NOT NULL);

-- ---------------------------------------------------------- E. post-conditions
DO $$
DECLARE
  v_src bigint;
  v_dst bigint;
  v_bad bigint;
BEGIN
  SELECT count(*) INTO v_src FROM public.strands;
  SELECT count(*) INTO v_dst FROM public.curriculum_nodes WHERE legacy_source = 'strand';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'Backfill mismatch: strands % vs nodes %', v_src, v_dst;
  END IF;

  SELECT count(*) INTO v_src FROM public.sub_strands;
  SELECT count(*) INTO v_dst FROM public.curriculum_nodes WHERE legacy_source = 'sub_strand';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'Backfill mismatch: sub_strands % vs nodes %', v_src, v_dst;
  END IF;

  SELECT count(*) INTO v_src FROM public.topics;
  SELECT count(*) INTO v_dst FROM public.curriculum_nodes WHERE legacy_source = 'topic';
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'Backfill mismatch: topics % vs nodes %', v_src, v_dst;
  END IF;

  SELECT count(*) INTO v_src FROM public.learning_outcomes;
  SELECT count(*) INTO v_dst FROM public.learning_objectives WHERE legacy_outcome_id IS NOT NULL;
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'Backfill mismatch: learning_outcomes % vs objectives %', v_src, v_dst;
  END IF;

  SELECT count(*) INTO v_src FROM public.curriculum_resources;
  SELECT count(*) INTO v_dst FROM public.learning_resources WHERE legacy_resource_id IS NOT NULL;
  IF v_src <> v_dst THEN
    RAISE EXCEPTION 'Backfill mismatch: curriculum_resources % vs learning_resources %', v_src, v_dst;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.curriculum_nodes c
    JOIN public.curriculum_nodes p ON p.id = c.parent_node_id
   WHERE p.subject_id <> c.subject_id;
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'Integrity failure: % nodes parented across subjects', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.lessons l
   WHERE l.curriculum_node_id IS NULL
     AND (l.sub_strand_id IS NOT NULL OR l.topic_id IS NOT NULL);
  IF v_bad <> 0 THEN
    RAISE EXCEPTION 'Integrity failure: % lessons left without a curriculum node', v_bad;
  END IF;
END
$$;

COMMIT;