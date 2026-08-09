BEGIN;

-- ============================================================
-- SEC-005
-- Tenant curriculum authoring is Organization Administrator-only.
-- Platform curriculum authority is handled explicitly by
-- app_private.is_platform_admin() in the relevant policies.
-- ============================================================

CREATE OR REPLACE FUNCTION app_private.can_author_curriculum(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p_org_id IS NOT NULL
    AND app_private.has_org_role(p_org_id, 'org_admin');
$function$;

-- RLS policies execute as the requesting authenticated role.
-- Keep this SECURITY DEFINER helper callable only by the role
-- that needs it for authenticated curriculum writes.
REVOKE ALL
ON FUNCTION app_private.can_author_curriculum(uuid)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION app_private.can_author_curriculum(uuid)
TO authenticated;


-- ============================================================
-- PLATFORM/GLOBAL CURRICULUM STRUCTURE
--
-- These legacy tables currently represent structural curriculum
-- concepts. Authenticated users may read platform rows, but only
-- Platform Administrators may write them.
--
-- Tenant ownership is explicitly rejected by WITH CHECK.
-- ============================================================

-- ---------------- curriculum_versions ----------------

DROP POLICY IF EXISTS curriculum_versions_select
ON public.curriculum_versions;

DROP POLICY IF EXISTS curriculum_versions_insert
ON public.curriculum_versions;

DROP POLICY IF EXISTS curriculum_versions_update
ON public.curriculum_versions;

DROP POLICY IF EXISTS curriculum_versions_delete
ON public.curriculum_versions;

CREATE POLICY curriculum_versions_select
ON public.curriculum_versions
FOR SELECT
TO authenticated
USING (
  organization_id IS NULL
  AND (
    status = 'published'
    OR app_private.is_platform_admin()
  )
);

CREATE POLICY curriculum_versions_insert
ON public.curriculum_versions
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY curriculum_versions_update
ON public.curriculum_versions
FOR UPDATE
TO authenticated
USING (
  organization_id IS NULL
  AND app_private.is_platform_admin()
)
WITH CHECK (
  organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY curriculum_versions_delete
ON public.curriculum_versions
FOR DELETE
TO authenticated
USING (
  organization_id IS NULL
  AND app_private.is_platform_admin()
);


-- ---------------- pathways ----------------

DROP POLICY IF EXISTS pathways_select
ON public.pathways;

DROP POLICY IF EXISTS pathways_insert
ON public.pathways;

DROP POLICY IF EXISTS pathways_update
ON public.pathways;

DROP POLICY IF EXISTS pathways_delete
ON public.pathways;

CREATE POLICY pathways_select
ON public.pathways
FOR SELECT
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND (
    status = 'published'
    OR app_private.is_platform_admin()
  )
);

CREATE POLICY pathways_insert
ON public.pathways
FOR INSERT
TO authenticated
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY pathways_update
ON public.pathways
FOR UPDATE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
)
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY pathways_delete
ON public.pathways
FOR DELETE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);


-- ---------------- subjects ----------------

DROP POLICY IF EXISTS subjects_select
ON public.subjects;

DROP POLICY IF EXISTS subjects_insert
ON public.subjects;

DROP POLICY IF EXISTS subjects_update
ON public.subjects;

DROP POLICY IF EXISTS subjects_delete
ON public.subjects;

CREATE POLICY subjects_select
ON public.subjects
FOR SELECT
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND (
    status = 'published'
    OR app_private.is_platform_admin()
  )
);

CREATE POLICY subjects_insert
ON public.subjects
FOR INSERT
TO authenticated
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY subjects_update
ON public.subjects
FOR UPDATE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
)
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY subjects_delete
ON public.subjects
FOR DELETE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);


-- ---------------- topics ----------------

DROP POLICY IF EXISTS topics_select
ON public.topics;

DROP POLICY IF EXISTS topics_insert
ON public.topics;

DROP POLICY IF EXISTS topics_update
ON public.topics;

DROP POLICY IF EXISTS topics_delete
ON public.topics;

CREATE POLICY topics_select
ON public.topics
FOR SELECT
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND (
    status = 'published'
    OR app_private.is_platform_admin()
  )
);

CREATE POLICY topics_insert
ON public.topics
FOR INSERT
TO authenticated
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY topics_update
ON public.topics
FOR UPDATE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
)
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY topics_delete
ON public.topics
FOR DELETE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);


-- ---------------- strands ----------------

DROP POLICY IF EXISTS strands_select
ON public.strands;

DROP POLICY IF EXISTS strands_insert
ON public.strands;

DROP POLICY IF EXISTS strands_update
ON public.strands;

DROP POLICY IF EXISTS strands_delete
ON public.strands;

CREATE POLICY strands_select
ON public.strands
FOR SELECT
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND (
    status = 'published'
    OR app_private.is_platform_admin()
  )
);

CREATE POLICY strands_insert
ON public.strands
FOR INSERT
TO authenticated
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY strands_update
ON public.strands
FOR UPDATE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
)
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY strands_delete
ON public.strands
FOR DELETE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);


-- ---------------- sub_strands ----------------

DROP POLICY IF EXISTS sub_strands_select
ON public.sub_strands;

DROP POLICY IF EXISTS sub_strands_insert
ON public.sub_strands;

DROP POLICY IF EXISTS sub_strands_update
ON public.sub_strands;

DROP POLICY IF EXISTS sub_strands_delete
ON public.sub_strands;

CREATE POLICY sub_strands_select
ON public.sub_strands
FOR SELECT
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND (
    status = 'published'
    OR app_private.is_platform_admin()
  )
);

CREATE POLICY sub_strands_insert
ON public.sub_strands
FOR INSERT
TO authenticated
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY sub_strands_update
ON public.sub_strands
FOR UPDATE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
)
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);

CREATE POLICY sub_strands_delete
ON public.sub_strands
FOR DELETE
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);


-- ---------------- learning_outcomes ----------------

DROP POLICY IF EXISTS learning_outcomes_select
ON public.learning_outcomes;

DROP POLICY IF EXISTS learning_outcomes_write
ON public.learning_outcomes;

CREATE POLICY learning_outcomes_select
ON public.learning_outcomes
FOR SELECT
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND (
    status = 'published'
    OR app_private.is_platform_admin()
  )
);

CREATE POLICY learning_outcomes_write
ON public.learning_outcomes
FOR ALL
TO authenticated
USING (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
)
WITH CHECK (
  authoring_organization_id IS NULL
  AND app_private.is_platform_admin()
);


-- ============================================================
-- MIXED-OWNERSHIP LESSONS
--
-- Platform lesson:
--   author_type = 'platform'
--   authoring_organization_id IS NULL
--
-- Tenant lesson:
--   author_type = 'tenant'
--   authoring_organization_id IS NOT NULL
--
-- Published tenant content remains tenant-isolated.
-- ============================================================

ALTER TABLE public.lessons
DROP CONSTRAINT IF EXISTS lessons_author_ownership_check;

ALTER TABLE public.lessons
ADD CONSTRAINT lessons_author_ownership_check
CHECK (
  (
    author_type = 'platform'
    AND authoring_organization_id IS NULL
  )
  OR
  (
    author_type = 'tenant'
    AND authoring_organization_id IS NOT NULL
  )
  OR author_type = 'licensed'
);

DROP POLICY IF EXISTS lessons_select
ON public.lessons;

DROP POLICY IF EXISTS lessons_insert
ON public.lessons;

DROP POLICY IF EXISTS lessons_update
ON public.lessons;

DROP POLICY IF EXISTS lessons_delete
ON public.lessons;

CREATE POLICY lessons_select
ON public.lessons
FOR SELECT
TO authenticated
USING (
  (
    author_type = 'platform'
    AND authoring_organization_id IS NULL
    AND (
      status = 'published'
      OR app_private.is_platform_admin()
    )
  )
  OR
  (
    author_type = 'tenant'
    AND authoring_organization_id IN (
      SELECT app_private.auth_organization_ids()
    )
  )
);

CREATE POLICY lessons_insert
ON public.lessons
FOR INSERT
TO authenticated
WITH CHECK (
  (
    author_type = 'platform'
    AND authoring_organization_id IS NULL
    AND app_private.is_platform_admin()
  )
  OR
  (
    author_type = 'tenant'
    AND authoring_organization_id IS NOT NULL
    AND app_private.can_author_curriculum(
      authoring_organization_id
    )
  )
);

CREATE POLICY lessons_update
ON public.lessons
FOR UPDATE
TO authenticated
USING (
  (
    author_type = 'platform'
    AND authoring_organization_id IS NULL
    AND app_private.is_platform_admin()
  )
  OR
  (
    author_type = 'tenant'
    AND app_private.can_author_curriculum(
      authoring_organization_id
    )
  )
)
WITH CHECK (
  (
    author_type = 'platform'
    AND authoring_organization_id IS NULL
    AND app_private.is_platform_admin()
  )
  OR
  (
    author_type = 'tenant'
    AND authoring_organization_id IS NOT NULL
    AND app_private.can_author_curriculum(
      authoring_organization_id
    )
  )
);

CREATE POLICY lessons_delete
ON public.lessons
FOR DELETE
TO authenticated
USING (
  (
    author_type = 'platform'
    AND authoring_organization_id IS NULL
    AND app_private.is_platform_admin()
  )
  OR
  (
    author_type = 'tenant'
    AND app_private.can_author_curriculum(
      authoring_organization_id
    )
  )
);


-- ============================================================
-- LEGACY LESSON-CHILD LEARNING OBJECTIVES
--
-- The current live learning_objectives table is still attached
-- directly to lessons. Until the Phase 10 curriculum_nodes
-- migration replaces that legacy relationship, visibility and
-- write authority inherit from the owning lesson.
-- ============================================================

DROP POLICY IF EXISTS learning_objectives_select
ON public.learning_objectives;

DROP POLICY IF EXISTS learning_objectives_write
ON public.learning_objectives;

CREATE POLICY learning_objectives_select
ON public.learning_objectives
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.id = learning_objectives.lesson_id
      AND (
        (
          l.author_type = 'platform'
          AND l.authoring_organization_id IS NULL
          AND (
            l.status = 'published'
            OR app_private.is_platform_admin()
          )
        )
        OR
        (
          l.author_type = 'tenant'
          AND l.authoring_organization_id IN (
            SELECT app_private.auth_organization_ids()
          )
        )
      )
  )
);

CREATE POLICY learning_objectives_write
ON public.learning_objectives
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.id = learning_objectives.lesson_id
      AND (
        (
          l.author_type = 'platform'
          AND l.authoring_organization_id IS NULL
          AND app_private.is_platform_admin()
        )
        OR
        (
          l.author_type = 'tenant'
          AND app_private.can_author_curriculum(
            l.authoring_organization_id
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.id = learning_objectives.lesson_id
      AND (
        (
          l.author_type = 'platform'
          AND l.authoring_organization_id IS NULL
          AND app_private.is_platform_admin()
        )
        OR
        (
          l.author_type = 'tenant'
          AND app_private.can_author_curriculum(
            l.authoring_organization_id
          )
        )
      )
  )
);


-- ============================================================
-- LESSON PREREQUISITES
-- Visibility and mutation authority inherit from the lesson.
-- ============================================================

DROP POLICY IF EXISTS lesson_prerequisites_select
ON public.lesson_prerequisites;

DROP POLICY IF EXISTS lesson_prerequisites_write
ON public.lesson_prerequisites;

CREATE POLICY lesson_prerequisites_select
ON public.lesson_prerequisites
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.id = lesson_prerequisites.lesson_id
      AND (
        (
          l.author_type = 'platform'
          AND l.authoring_organization_id IS NULL
          AND (
            l.status = 'published'
            OR app_private.is_platform_admin()
          )
        )
        OR
        (
          l.author_type = 'tenant'
          AND l.authoring_organization_id IN (
            SELECT app_private.auth_organization_ids()
          )
        )
      )
  )
);

CREATE POLICY lesson_prerequisites_write
ON public.lesson_prerequisites
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.id = lesson_prerequisites.lesson_id
      AND (
        (
          l.author_type = 'platform'
          AND l.authoring_organization_id IS NULL
          AND app_private.is_platform_admin()
        )
        OR
        (
          l.author_type = 'tenant'
          AND app_private.can_author_curriculum(
            l.authoring_organization_id
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.lessons l
    WHERE l.id = lesson_prerequisites.lesson_id
      AND (
        (
          l.author_type = 'platform'
          AND l.authoring_organization_id IS NULL
          AND app_private.is_platform_admin()
        )
        OR
        (
          l.author_type = 'tenant'
          AND app_private.can_author_curriculum(
            l.authoring_organization_id
          )
        )
      )
  )
);


-- ============================================================
-- CURRICULUM RESOURCE METADATA
--
-- NULL organization_id = platform resource.
-- UUID organization_id = tenant resource.
-- ============================================================

DROP POLICY IF EXISTS curriculum_resources_select
ON public.curriculum_resources;

DROP POLICY IF EXISTS curriculum_resources_write
ON public.curriculum_resources;

CREATE POLICY curriculum_resources_select
ON public.curriculum_resources
FOR SELECT
TO authenticated
USING (
  organization_id IS NULL
  OR organization_id IN (
    SELECT app_private.auth_organization_ids()
  )
);

CREATE POLICY curriculum_resources_write
ON public.curriculum_resources
FOR ALL
TO authenticated
USING (
  (
    organization_id IS NULL
    AND app_private.is_platform_admin()
  )
  OR app_private.can_author_curriculum(
    organization_id
  )
)
WITH CHECK (
  (
    organization_id IS NULL
    AND app_private.is_platform_admin()
  )
  OR app_private.can_author_curriculum(
    organization_id
  )
);


-- ============================================================
-- PRIVATE CURRICULUM RESOURCE STORAGE
--
-- The current bucket uses an organization UUID as the first
-- folder component. Therefore current direct file uploads are
-- tenant-owned and Organization Administrator-only.
-- ============================================================

DROP POLICY IF EXISTS curriculum_resources_insert
ON storage.objects;

DROP POLICY IF EXISTS curriculum_resources_update
ON storage.objects;

DROP POLICY IF EXISTS curriculum_resources_delete
ON storage.objects;

CREATE POLICY curriculum_resources_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'curriculum-resources'
  AND app_private.can_author_curriculum(
    ((storage.foldername(name))[1])::uuid
  )
);

CREATE POLICY curriculum_resources_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'curriculum-resources'
  AND app_private.can_author_curriculum(
    ((storage.foldername(name))[1])::uuid
  )
)
WITH CHECK (
  bucket_id = 'curriculum-resources'
  AND app_private.can_author_curriculum(
    ((storage.foldername(name))[1])::uuid
  )
);

CREATE POLICY curriculum_resources_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'curriculum-resources'
  AND app_private.can_author_curriculum(
    ((storage.foldername(name))[1])::uuid
  )
);

-- ============================================================
-- OWNERSHIP IMMUTABILITY
--
-- Authorization for an UPDATE evaluates the existing row
-- through USING and the resulting row through WITH CHECK.
-- A principal holding both platform-admin and org-admin
-- authority must therefore not be able to cross the ownership
-- boundary during an UPDATE.
--
-- Ownership changes require an explicit future administrative
-- migration/workflow rather than an ordinary application write.
-- ============================================================

CREATE OR REPLACE FUNCTION app_private.prevent_lesson_ownership_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF
    NEW.author_type IS DISTINCT FROM OLD.author_type
    OR NEW.authoring_organization_id
       IS DISTINCT FROM OLD.authoring_organization_id
  THEN
    RAISE EXCEPTION
      'Lesson ownership cannot be changed after creation.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS lessons_ownership_immutable
ON public.lessons;

CREATE TRIGGER lessons_ownership_immutable
BEFORE UPDATE OF
  author_type,
  authoring_organization_id
ON public.lessons
FOR EACH ROW
EXECUTE FUNCTION app_private.prevent_lesson_ownership_change();


CREATE OR REPLACE FUNCTION app_private.prevent_curriculum_resource_ownership_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
  THEN
    RAISE EXCEPTION
      'Curriculum resource ownership cannot be changed after creation.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS curriculum_resources_ownership_immutable
ON public.curriculum_resources;

CREATE TRIGGER curriculum_resources_ownership_immutable
BEFORE UPDATE OF organization_id
ON public.curriculum_resources
FOR EACH ROW
EXECUTE FUNCTION
  app_private.prevent_curriculum_resource_ownership_change();


COMMIT;
