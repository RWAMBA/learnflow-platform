-- =============================================================================
-- Phase 10 Stage 1 — dedicated private curriculum RIGHTS EVIDENCE storage.
--
-- ADDITIVE ONLY. This migration does not touch, drop, replace or weaken the
-- four existing curriculum_resources_* policies on storage.objects, and it does
-- not modify any previously applied migration.
--
-- Invariants established here:
--   * Licence / rights evidence lives in its own private bucket
--     ('curriculum-rights-evidence'), never in tenant learning-resource paths.
--   * Anonymous and ordinary authenticated principals have NO policy on that
--     bucket, so every direct list/read/write/sign attempt fails closed.
--   * Only an ACTIVE Platform Administrator (app_private.is_platform_admin())
--     may touch objects there, and only on server-generated, non-enumerable
--     object keys under the fixed 'rights-evidence/' namespace.
--   * Evidence references are held in public.rights_evidence_documents with an
--     explicit MIME / extension / size allowlist and an immutable object path.
--   * Every insert, change, supersession and deletion is written to the
--     immutable public.rights_audit_log.
-- =============================================================================

-- ----------------------------------------------------------------- bucket ---
-- The hosted project provisions the private 'curriculum-rights-evidence'
-- bucket through the Supabase Storage provisioning tool. The idempotent
-- INSERT that the CI replay uses is omitted here because hosted migrations
-- may not write to storage.buckets.
-- --------------------------------------------------------- path allowlist ---
-- Object keys are server-generated and non-enumerable:
--   rights-evidence/<uuid>/<32 hex chars>.<allowed extension>
-- Anything else — traversal, encoded traversal, tenant prefixes, arbitrary
-- caller-supplied paths — fails this predicate and therefore fails the policy.
CREATE OR REPLACE FUNCTION app_private.is_rights_evidence_path(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_name IS NOT NULL
     AND position('..' IN p_name) = 0
     AND position('%2e' IN lower(p_name)) = 0
     AND position('\' IN p_name) = 0
     AND p_name ~ '^rights-evidence/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32}\.(pdf|png|jpg|jpeg|txt)$';
$$;

REVOKE ALL ON FUNCTION app_private.is_rights_evidence_path(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_rights_evidence_path(text)
  TO authenticated, anon, service_role;

-- ------------------------------------------------- storage.objects policies --
-- Additive policies, scoped to the evidence bucket only. No policy is granted
-- to anon, so anonymous access is denied by absence as well as by predicate.
DROP POLICY IF EXISTS rights_evidence_read ON storage.objects;
CREATE POLICY rights_evidence_read
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'curriculum-rights-evidence'
  AND app_private.is_platform_admin()
  AND app_private.is_rights_evidence_path(name)
);

DROP POLICY IF EXISTS rights_evidence_insert ON storage.objects;
CREATE POLICY rights_evidence_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'curriculum-rights-evidence'
  AND app_private.is_platform_admin()
  AND app_private.is_rights_evidence_path(name)
);

DROP POLICY IF EXISTS rights_evidence_update ON storage.objects;
CREATE POLICY rights_evidence_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'curriculum-rights-evidence'
  AND app_private.is_platform_admin()
  AND app_private.is_rights_evidence_path(name)
)
WITH CHECK (
  bucket_id = 'curriculum-rights-evidence'
  AND app_private.is_platform_admin()
  AND app_private.is_rights_evidence_path(name)
);

DROP POLICY IF EXISTS rights_evidence_delete ON storage.objects;
CREATE POLICY rights_evidence_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'curriculum-rights-evidence'
  AND app_private.is_platform_admin()
  AND app_private.is_rights_evidence_path(name)
);

-- ------------------------------------------------- evidence document rows ---
CREATE TABLE IF NOT EXISTS public.rights_evidence_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rights_grant_id uuid REFERENCES public.rights_grants(id) ON DELETE CASCADE,
  source_artifact_id uuid REFERENCES public.source_artifacts(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'curriculum-rights-evidence',
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  checksum text,
  status text NOT NULL DEFAULT 'pending',
  supersedes_id uuid REFERENCES public.rights_evidence_documents(id) ON DELETE SET NULL,
  withdrawal_reason text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rights_evidence_documents_owner_present
    CHECK (rights_grant_id IS NOT NULL OR source_artifact_id IS NOT NULL),
  CONSTRAINT rights_evidence_documents_status_valid
    CHECK (status IN ('pending', 'stored', 'superseded', 'withdrawn')),
  CONSTRAINT rights_evidence_documents_bucket_fixed
    CHECK (storage_bucket = 'curriculum-rights-evidence')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rights_evidence_documents TO authenticated;
GRANT ALL ON public.rights_evidence_documents TO service_role;

ALTER TABLE public.rights_evidence_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rights_evidence_documents_platform_read ON public.rights_evidence_documents;
CREATE POLICY rights_evidence_documents_platform_read
  ON public.rights_evidence_documents
  FOR SELECT TO authenticated
  USING (app_private.is_platform_admin());

DROP POLICY IF EXISTS rights_evidence_documents_platform_insert ON public.rights_evidence_documents;
CREATE POLICY rights_evidence_documents_platform_insert
  ON public.rights_evidence_documents
  FOR INSERT TO authenticated
  WITH CHECK (app_private.is_platform_admin());

DROP POLICY IF EXISTS rights_evidence_documents_platform_update ON public.rights_evidence_documents;
CREATE POLICY rights_evidence_documents_platform_update
  ON public.rights_evidence_documents
  FOR UPDATE TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());

DROP POLICY IF EXISTS rights_evidence_documents_platform_delete ON public.rights_evidence_documents;
CREATE POLICY rights_evidence_documents_platform_delete
  ON public.rights_evidence_documents
  FOR DELETE TO authenticated
  USING (app_private.is_platform_admin());

CREATE INDEX IF NOT EXISTS rights_evidence_documents_grant_idx
  ON public.rights_evidence_documents (rights_grant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rights_evidence_documents_artifact_idx
  ON public.rights_evidence_documents (source_artifact_id, created_at DESC);

-- -------------------------------------------------------- validation guard ---
-- Documented allowlist. A file that is not on it never reaches Storage,
-- because the ticket row must exist before the signed upload is issued.
CREATE OR REPLACE FUNCTION app_private.validate_rights_evidence_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ext text;
BEGIN
  IF NEW.mime_type NOT IN ('application/pdf', 'image/png', 'image/jpeg', 'text/plain') THEN
    RAISE EXCEPTION 'rights evidence: MIME type % is not on the allowlist', NEW.mime_type;
  END IF;
  IF NEW.byte_size IS NULL OR NEW.byte_size <= 0 OR NEW.byte_size > 26214400 THEN
    RAISE EXCEPTION 'rights evidence: byte size % is outside the permitted range (1..26214400)', NEW.byte_size;
  END IF;
  IF NOT app_private.is_rights_evidence_path(NEW.storage_path) THEN
    RAISE EXCEPTION 'rights evidence: storage path is not a server-generated evidence key';
  END IF;

  v_ext := lower(split_part(NEW.storage_path, '.', 2));
  IF (NEW.mime_type = 'application/pdf' AND v_ext <> 'pdf')
     OR (NEW.mime_type = 'image/png' AND v_ext <> 'png')
     OR (NEW.mime_type = 'image/jpeg' AND v_ext NOT IN ('jpg', 'jpeg'))
     OR (NEW.mime_type = 'text/plain' AND v_ext <> 'txt') THEN
    RAISE EXCEPTION 'rights evidence: extension % does not match MIME type %', v_ext, NEW.mime_type;
  END IF;

  IF position('/' IN NEW.original_filename) > 0
     OR position('\' IN NEW.original_filename) > 0
     OR position('..' IN NEW.original_filename) > 0 THEN
    RAISE EXCEPTION 'rights evidence: original filename must not contain a path';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Evidence is never silently replaced in place: a replacement is a new
    -- row that supersedes the old one, so the audit trail stays complete.
    IF NEW.storage_path <> OLD.storage_path OR NEW.storage_bucket <> OLD.storage_bucket THEN
      RAISE EXCEPTION 'rights evidence: the stored object path is immutable';
    END IF;
    IF NEW.uploaded_by <> OLD.uploaded_by THEN
      RAISE EXCEPTION 'rights evidence: the uploading administrator is immutable';
    END IF;
    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS rights_evidence_documents_validate ON public.rights_evidence_documents;
CREATE TRIGGER rights_evidence_documents_validate
  BEFORE INSERT OR UPDATE ON public.rights_evidence_documents
  FOR EACH ROW EXECUTE FUNCTION app_private.validate_rights_evidence_document();

-- ------------------------------------------------------------ audit trail ---
CREATE OR REPLACE FUNCTION app_private.log_rights_evidence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.rights_audit_log (entity_type, entity_id, action, actor_id, previous_state, new_state)
  VALUES (
    'rights_evidence_document',
    COALESCE(NEW.id, OLD.id),
    lower(TG_OP),
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END
$$;

DROP TRIGGER IF EXISTS rights_evidence_documents_audit ON public.rights_evidence_documents;
CREATE TRIGGER rights_evidence_documents_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rights_evidence_documents
  FOR EACH ROW EXECUTE FUNCTION app_private.log_rights_evidence_change();