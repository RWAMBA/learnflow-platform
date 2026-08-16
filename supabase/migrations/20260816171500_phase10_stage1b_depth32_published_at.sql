-- Phase 10 Stage 1B — controlled reconciliation repair 2 (forward-only).
--
-- Corrects two defects introduced by 20260816145744:
--   1. the effective curriculum-node hierarchy depth limit was reduced from the
--      authoritative 32 (established by 20260816140135) to 8;
--   2. published_at was only assigned when the client left it NULL, so a client
--      supplied timestamp survived publication.
--
-- Forward-only: no prior migration is edited, renamed, removed or reapplied.
-- No table, column or policy is dropped. No DML other than the guard functions.
-- Out of scope: curriculum_versions lifecycle normalisation (deferred), SEC-006
-- stage two, Auth/MFA configuration, Stage 1C objects.

BEGIN;

-- ------------------------------------------------------- 0. fail-closed gate
-- Refuse to replace anything other than the reviewed depth-8 definitions.
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app_private' AND p.proname = 'enforce_curriculum_node_acyclic';
  IF v_src IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: app_private.enforce_curriculum_node_acyclic() is not installed';
  END IF;
  IF position('v_max_depth constant int := 8' in v_src) = 0 THEN
    RAISE EXCEPTION 'Precondition failed: installed acyclicity guard is not the reviewed depth-8 version';
  END IF;

  IF to_regprocedure('app_private.enforce_curriculum_node_lifecycle()') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: curriculum node lifecycle guard is not installed';
  END IF;
  IF to_regprocedure('app_private.enforce_learning_resource_lifecycle()') IS NULL THEN
    RAISE EXCEPTION 'Precondition failed: learning resource lifecycle guard is not installed';
  END IF;

  IF EXISTS (SELECT 1 FROM public.curriculum_nodes WHERE authoring_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Precondition failed: tenant-owned curriculum_nodes rows exist';
  END IF;
END
$$;

-- ------------------------------------- A. authoritative depth-32 acyclicity
-- Effective business-rule limit: a node's own level plus the relative depth of
-- its deepest existing descendant may not exceed 32. Ancestor and descendant
-- validation share the single constant below.
CREATE OR REPLACE FUNCTION app_private.enforce_curriculum_node_acyclic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_max_depth constant int := 32;
  v_parent uuid;
  v_subject uuid;
  v_ancestor_depth int := 0;
  v_subtree_depth int := 0;
  v_subtree_cycle boolean := false;
BEGIN
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
      IF v_parent = NEW.id THEN
        RAISE EXCEPTION 'curriculum node cycle violation';
      END IF;
      -- Bounded recursion: one level beyond the authoritative limit is enough
      -- to prove the structure is invalid, and stops malformed ancestor chains.
      IF v_ancestor_depth > v_max_depth THEN
        RAISE EXCEPTION 'curriculum node depth limit exceeded';
      END IF;
      SELECT n.parent_node_id INTO v_parent
        FROM public.curriculum_nodes n WHERE n.id = v_parent;
    END LOOP;
  END IF;

  -- Existing descendants travel with the node: the moved subtree must still fit
  -- inside the same authoritative limit. Traversal is cycle-safe and bounded at
  -- one level past the limit, never at an implementation-specific smaller value.
  IF TG_OP = 'UPDATE' THEN
    WITH RECURSIVE subtree(id, depth, path, is_cycle) AS (
      SELECT NEW.id, 1, ARRAY[NEW.id], false
      UNION ALL
      SELECT c.id, s.depth + 1, s.path || c.id, c.id = ANY(s.path)
        FROM public.curriculum_nodes c
        JOIN subtree s ON c.parent_node_id = s.id
       WHERE NOT s.is_cycle
         AND s.depth < (v_max_depth + 1)
    )
    SELECT max(s.depth), coalesce(bool_or(s.is_cycle), false)
      INTO v_subtree_depth, v_subtree_cycle
      FROM subtree s;

    IF v_subtree_cycle THEN
      RAISE EXCEPTION 'curriculum node cycle violation';
    END IF;
  ELSE
    v_subtree_depth := 1;
  END IF;

  IF coalesce(v_subtree_depth, 1) + v_ancestor_depth > v_max_depth THEN
    RAISE EXCEPTION 'curriculum node subtree depth limit exceeded';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.subject_id IS DISTINCT FROM OLD.subject_id THEN
    IF EXISTS (
      WITH RECURSIVE subtree(id, path, is_cycle) AS (
        SELECT NEW.id, ARRAY[NEW.id], false
        UNION ALL
        SELECT c.id, s.path || c.id, c.id = ANY(s.path)
          FROM public.curriculum_nodes c
          JOIN subtree s ON c.parent_node_id = s.id
         WHERE NOT s.is_cycle
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

-- ------------------------------- B. node lifecycle + server-authoritative time
-- Strict Stage 1B lifecycle retained: draft -> review -> published -> archived,
-- only published rows may be archived, archived rows are frozen, published and
-- archived rows cannot be deleted. published_at is database-assigned only.
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

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'archived' THEN
      RAISE EXCEPTION 'curriculum node lifecycle violation';
    END IF;
    -- The database, never the client, decides publication time.
    IF NEW.status = 'published' THEN
      NEW.published_at := now();
    ELSE
      NEW.published_at := NULL;
    END IF;
    RETURN NEW;
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
    -- Archival never rewrites publication time.
    NEW.published_at := OLD.published_at;
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'archived' THEN
    RAISE EXCEPTION 'curriculum node lifecycle violation';
  END IF;
  IF OLD.status = 'review' AND NEW.status = 'archived' THEN
    RAISE EXCEPTION 'curriculum node lifecycle violation';
  END IF;

  IF NEW.status = 'published' THEN
    NEW.published_at := now();
  ELSE
    NEW.published_at := OLD.published_at;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS curriculum_nodes_enforce_lifecycle ON public.curriculum_nodes;
CREATE TRIGGER curriculum_nodes_enforce_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.curriculum_nodes
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_node_lifecycle();

REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_node_lifecycle() FROM authenticated;

-- --------------------- C. learning resource lifecycle + authoritative time
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

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'archived' THEN
      RAISE EXCEPTION 'learning resource lifecycle violation';
    END IF;
    IF NEW.status = 'published' THEN
      NEW.published_at := now();
    ELSE
      NEW.published_at := NULL;
    END IF;
    RETURN NEW;
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

  IF OLD.status <> 'published' AND NEW.status = 'published' THEN
    NEW.published_at := now();
  ELSE
    NEW.published_at := OLD.published_at;
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS learning_resources_enforce_lifecycle ON public.learning_resources;
CREATE TRIGGER learning_resources_enforce_lifecycle
  BEFORE INSERT OR UPDATE OR DELETE ON public.learning_resources
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_learning_resource_lifecycle();

REVOKE ALL ON FUNCTION app_private.enforce_learning_resource_lifecycle() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.enforce_learning_resource_lifecycle() FROM anon;
REVOKE ALL ON FUNCTION app_private.enforce_learning_resource_lifecycle() FROM authenticated;

-- ---------------------------------------------------------- D. post-conditions
DO $$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'app_private' AND p.proname = 'enforce_curriculum_node_acyclic';
  IF position('v_max_depth constant int := 32' in v_src) = 0 THEN
    RAISE EXCEPTION 'Post-condition failed: authoritative depth limit 32 is not installed';
  END IF;
  IF position('v_max_depth constant int := 8' in v_src) <> 0 THEN
    RAISE EXCEPTION 'Post-condition failed: superseded depth-8 limit is still present';
  END IF;

  IF EXISTS (SELECT 1 FROM public.curriculum_nodes WHERE authoring_organization_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Post-condition failed: tenant-owned curriculum nodes exist';
  END IF;
END
$$;

COMMIT;
