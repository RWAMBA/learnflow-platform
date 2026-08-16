BEGIN;

-- ===========================================================================
-- Phase 10 Stage 1B — Controlled Reconciliation Repair (forward-only)
-- ===========================================================================

-- --------------------------------------------------------------- preconditions
DO $$
BEGIN
  IF to_regclass('public.curriculum_nodes') IS NULL
     OR to_regclass('public.learning_resources') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: Stage 1B tables are not present';
  END IF;

  IF EXISTS (SELECT 1 FROM public.curriculum_nodes WHERE authoring_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Precondition failed: tenant-owned curriculum_nodes rows exist';
  END IF;
END
$$;

-- --------------------------------------------- A. platform-only node ownership
ALTER TABLE public.curriculum_nodes
  ADD CONSTRAINT curriculum_nodes_platform_owned_chk
  CHECK (authoring_organization_id IS NULL) NOT VALID;
ALTER TABLE public.curriculum_nodes
  VALIDATE CONSTRAINT curriculum_nodes_platform_owned_chk;

-- ------------------------------------- B. subtree-aware acyclicity/depth guard
CREATE OR REPLACE FUNCTION app_private.enforce_curriculum_node_acyclic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_max_depth constant int := 8;
  v_parent uuid;
  v_subject uuid;
  v_ancestor_depth int := 0;
  v_subtree_depth int := 0;
BEGIN
  -- Root nodes still need their own subtree re-validated on a move to root.
  IF NEW.parent_node_id IS NOT NULL THEN
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
      v_ancestor_depth := v_ancestor_depth + 1;
      IF v_ancestor_depth > v_max_depth THEN
        RAISE EXCEPTION 'curriculum node depth limit exceeded';
      END IF;
      IF v_parent = NEW.id THEN
        RAISE EXCEPTION 'curriculum node cycle violation';
      END IF;
      SELECT n.parent_node_id INTO v_parent
        FROM public.curriculum_nodes n WHERE n.id = v_parent;
    END LOOP;
  END IF;

  -- Existing descendants travel with the node: the moved subtree must still fit.
  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE subtree(id, depth) AS (
      SELECT NEW.id, 1
      UNION ALL
      SELECT c.id, s.depth + 1
        FROM public.curriculum_nodes c
        JOIN subtree s ON c.parent_node_id = s.id
       WHERE s.depth < (v_max_depth + 1)
    )
    SELECT max(depth) INTO v_subtree_depth FROM subtree;
  ELSE
    v_subtree_depth := 1;
  END IF;

  IF coalesce(v_subtree_depth, 1) + v_ancestor_depth > v_max_depth THEN
    RAISE EXCEPTION 'curriculum node subtree depth limit exceeded';
  END IF;

  -- Descendants must remain in the same subject as the node they hang from.
  IF TG_OP = 'UPDATE' AND NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
    IF EXISTS (
      WITH RECURSIVE subtree(id) AS (
        SELECT NEW.id
        UNION ALL
        SELECT c.id FROM public.curriculum_nodes c JOIN subtree s ON c.parent_node_id = s.id
      )
      SELECT 1 FROM public.curriculum_nodes n
       JOIN subtree s ON s.id = n.id
      WHERE n.id <> NEW.id AND n.subject_id IS DISTINCT FROM NEW.subject_id
    ) THEN
      RAISE EXCEPTION 'curriculum node subtree subject mismatch';
    END IF;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS curriculum_nodes_enforce_acyclic ON public.curriculum_nodes;
CREATE TRIGGER curriculum_nodes_enforce_acyclic
  BEFORE INSERT OR UPDATE OF parent_node_id, subject_id ON public.curriculum_nodes
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_node_acyclic();

REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_acyclic() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_acyclic() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_acyclic() FROM authenticated;

-- --------------------------------------------------- C. node lifecycle guard
CREATE OR REPLACE FUNCTION app_private.enforce_curriculum_node_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published','archived') THEN
      RAISE EXCEPTION 'curriculum node lifecycle violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status NOT IN ('draft','review','published','archived') THEN
    RAISE EXCEPTION 'curriculum node lifecycle violation';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'curriculum node lifecycle violation';
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status <> 'archived' THEN
      RAISE EXCEPTION 'curriculum node lifecycle violation';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.subject_id IS DISTINCT FROM OLD.subject_id
       OR NEW.parent_node_id IS DISTINCT FROM OLD.parent_node_id
       OR NEW.node_type IS DISTINCT FROM OLD.node_type
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.sequence_order IS DISTINCT FROM OLD.sequence_order
       OR NEW.authoring_organization_id IS DISTINCT FROM OLD.authoring_organization_id
       OR NEW.curriculum_version_id IS DISTINCT FROM OLD.curriculum_version_id
       OR NEW.legacy_source IS DISTINCT FROM OLD.legacy_source
       OR NEW.legacy_id IS DISTINCT FROM OLD.legacy_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'curriculum node lifecycle violation';
    END IF;
    RETURN NEW;
  END IF;

  -- draft/review may advance to review or published only.
  IF OLD.status = 'draft' AND NEW.status = 'archived' THEN
    RAISE EXCEPTION 'curriculum node lifecycle violation';
  END IF;
  IF OLD.status = 'review' AND NEW.status = 'archived' THEN
    RAISE EXCEPTION 'curriculum node lifecycle violation';
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS curriculum_nodes_enforce_lifecycle ON public.curriculum_nodes;
CREATE TRIGGER curriculum_nodes_enforce_lifecycle
  BEFORE UPDATE OR DELETE ON public.curriculum_nodes
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_node_lifecycle();

REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_lifecycle() FROM authenticated;

-- --------------------------------------- D. learning resource lifecycle guard
CREATE OR REPLACE FUNCTION app_private.enforce_learning_resource_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'archived' THEN
      RAISE EXCEPTION 'learning resource lifecycle violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.status NOT IN ('draft','review','published','archived') THEN
    RAISE EXCEPTION 'learning resource lifecycle violation';
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'learning resource lifecycle violation';
  END IF;

  IF OLD.status = 'published' AND NEW.status NOT IN ('published','archived') THEN
    RAISE EXCEPTION 'learning resource lifecycle violation';
  END IF;

  IF OLD.status IN ('draft','review') AND NEW.status = 'archived' THEN
    RAISE EXCEPTION 'learning resource lifecycle violation';
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS learning_resources_enforce_lifecycle ON public.learning_resources;
CREATE TRIGGER learning_resources_enforce_lifecycle
  BEFORE UPDATE OR DELETE ON public.learning_resources
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_learning_resource_lifecycle();

REVOKE ALL ON FUNCTION app_private.enforce_learning_resource_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_learning_resource_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_learning_resource_lifecycle() FROM authenticated;

-- ------------------------------------------- E. lesson backfill gap closure
-- Lessons linked only through a legacy learning outcome inherit that outcome's node.
UPDATE public.lessons l
   SET curriculum_node_id = o.curriculum_node_id
  FROM public.learning_objectives o
 WHERE l.curriculum_node_id IS NULL
   AND l.learning_outcome_id IS NOT NULL
   AND o.legacy_outcome_id = l.learning_outcome_id
   AND o.curriculum_node_id IS NOT NULL;

-- ---------------------------------------------------------- F. post-conditions
DO $$
DECLARE
  v_unmapped bigint;
  v_tenant bigint;
BEGIN
  SELECT count(*) INTO v_unmapped
    FROM public.lessons l
   WHERE l.curriculum_node_id IS NULL
     AND (l.sub_strand_id IS NOT NULL OR l.topic_id IS NOT NULL OR l.learning_outcome_id IS NOT NULL);
  IF v_unmapped <> 0 THEN
    RAISE EXCEPTION 'Backfill gap: % lessons retain a legacy link without a curriculum node', v_unmapped;
  END IF;

  SELECT count(*) INTO v_tenant FROM public.curriculum_nodes WHERE authoring_organization_id IS NOT NULL;
  IF v_tenant <> 0 THEN
    RAISE EXCEPTION 'Ownership violation: % tenant-owned curriculum nodes', v_tenant;
  END IF;
END
$$;

COMMIT;