BEGIN;

-- ============================================================ 1. PROVENANCE

CREATE TABLE IF NOT EXISTS public.source_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rights_holder text NOT NULL,
  source_title text NOT NULL,
  source_type text NOT NULL DEFAULT 'official_document'
    CHECK (source_type IN ('official_document','publisher_material','open_licensed','learnflow_original','other')),
  authoritative_url text,
  document_date date,
  jurisdiction text,
  acquisition_method text NOT NULL DEFAULT 'unknown'
    CHECK (acquisition_method IN ('unknown','official_download','licensed_supply','direct_grant','public_domain','learnflow_authored')),
  edition text,
  checksum text,
  original_artifact_path text,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','in_review','verified','rejected')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_artifacts TO authenticated;
GRANT ALL ON public.source_artifacts TO service_role;
ALTER TABLE public.source_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_artifacts_platform_admin ON public.source_artifacts
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());
CREATE TRIGGER source_artifacts_set_updated_at BEFORE UPDATE ON public.source_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================ 2. RIGHTS GRANTS

CREATE TABLE IF NOT EXISTS public.rights_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_artifact_id uuid NOT NULL REFERENCES public.source_artifacts(id) ON DELETE CASCADE,
  grant_type text NOT NULL DEFAULT 'unknown'
    CHECK (grant_type IN ('unknown','open_licence','commercial_licence','written_permission','public_domain','learnflow_owned')),
  grant_reference text,
  evidence_storage_path text,
  effective_date date,
  expiry_date date,
  territory text,
  attribution_text text,
  restrictions text,
  reviewer_id uuid,
  reviewed_at timestamptz,
  permits_commercial_use boolean NOT NULL DEFAULT false,
  permits_storage boolean NOT NULL DEFAULT false,
  permits_transformation boolean NOT NULL DEFAULT false,
  permits_authenticated_display boolean NOT NULL DEFAULT false,
  permits_public_display boolean NOT NULL DEFAULT false,
  permits_download boolean NOT NULL DEFAULT false,
  permits_translation boolean NOT NULL DEFAULT false,
  permits_derivative_works boolean NOT NULL DEFAULT false,
  permits_sublicensing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rights_grants TO authenticated;
GRANT ALL ON public.rights_grants TO service_role;
ALTER TABLE public.rights_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY rights_grants_platform_admin ON public.rights_grants
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());
CREATE TRIGGER rights_grants_set_updated_at BEFORE UPDATE ON public.rights_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================ 3. TRACEABILITY LINKS

CREATE TABLE IF NOT EXISTS public.source_artifact_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_artifact_id uuid NOT NULL REFERENCES public.source_artifacts(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN
    ('curriculum_version','education_stage','academic_level','track','subject','curriculum_node','learning_objective','lesson','learning_resource')),
  entity_id uuid NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_artifact_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS source_artifact_links_entity_idx
  ON public.source_artifact_links (entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.source_artifact_links TO authenticated;
GRANT ALL ON public.source_artifact_links TO service_role;
ALTER TABLE public.source_artifact_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY source_artifact_links_platform_admin ON public.source_artifact_links
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());

-- ============================================================ 4. IMPORT BATCHES

CREATE TABLE IF NOT EXISTS public.curriculum_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_reference text NOT NULL UNIQUE,
  source_artifact_id uuid REFERENCES public.source_artifacts(id) ON DELETE SET NULL,
  source_package text,
  imported_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  dry_run boolean NOT NULL DEFAULT true,
  dry_run_result jsonb,
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  rollback_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.curriculum_import_batches TO authenticated;
GRANT ALL ON public.curriculum_import_batches TO service_role;
ALTER TABLE public.curriculum_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY curriculum_import_batches_platform_admin ON public.curriculum_import_batches
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());
CREATE TRIGGER curriculum_import_batches_set_updated_at BEFORE UPDATE ON public.curriculum_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================ 5. IMMUTABLE RIGHTS AUDIT

CREATE TABLE IF NOT EXISTS public.rights_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rights_audit_log_entity_idx
  ON public.rights_audit_log (entity_type, entity_id, created_at DESC);

GRANT SELECT, INSERT ON public.rights_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.rights_audit_log TO service_role;
ALTER TABLE public.rights_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY rights_audit_log_platform_admin_read ON public.rights_audit_log
  FOR SELECT TO authenticated USING (app_private.is_platform_admin());
CREATE POLICY rights_audit_log_platform_admin_insert ON public.rights_audit_log
  FOR INSERT TO authenticated WITH CHECK (app_private.is_platform_admin());

CREATE OR REPLACE FUNCTION app_private.reject_rights_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'rights_audit_log is append-only';
END;
$$;
REVOKE ALL ON FUNCTION app_private.reject_rights_audit_mutation() FROM PUBLIC;

CREATE TRIGGER rights_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.rights_audit_log
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_rights_audit_mutation();

-- Record every rights-grant decision automatically.
CREATE OR REPLACE FUNCTION app_private.log_rights_grant_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.rights_audit_log (entity_type, entity_id, action, actor_id, previous_state, new_state)
  VALUES ('rights_grant',
          COALESCE(NEW.id, OLD.id),
          lower(TG_OP),
          auth.uid(),
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END);
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION app_private.log_rights_grant_change() FROM PUBLIC;

CREATE TRIGGER rights_grants_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.rights_grants
  FOR EACH ROW EXECUTE FUNCTION app_private.log_rights_grant_change();

-- ============================================================ 6. READINESS / RIGHTS / ACTIVATION

ALTER TABLE public.curriculum_versions
  ADD COLUMN IF NOT EXISTS content_readiness text NOT NULL DEFAULT 'none'
    CHECK (content_readiness IN ('none','partial','complete')),
  ADD COLUMN IF NOT EXISTS rights_status text NOT NULL DEFAULT 'unknown'
    CHECK (rights_status IN ('unknown','review_required','authorized','restricted','expired')),
  ADD COLUMN IF NOT EXISTS activation_status text NOT NULL DEFAULT 'inactive'
    CHECK (activation_status IN ('inactive','internal_preview','active')),
  ADD COLUMN IF NOT EXISTS rights_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rights_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS availability_note text;

ALTER TABLE public.education_stages
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unavailable_reason text;

ALTER TABLE public.grades
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS unavailable_reason text;

-- A qualifying rights grant: reviewed, unexpired, effective, and permitting
-- commercial use, storage and authenticated display.
CREATE OR REPLACE FUNCTION public.curriculum_version_has_qualifying_grant(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.source_artifact_links l
    JOIN public.rights_grants g ON g.source_artifact_id = l.source_artifact_id
    WHERE l.entity_type = 'curriculum_version'
      AND l.entity_id = p_version_id
      AND g.reviewer_id IS NOT NULL
      AND g.reviewed_at IS NOT NULL
      AND (g.effective_date IS NULL OR g.effective_date <= current_date)
      AND (g.expiry_date IS NULL OR g.expiry_date >= current_date)
      AND g.permits_commercial_use
      AND g.permits_storage
      AND g.permits_authenticated_display
  );
$$;
REVOKE ALL ON FUNCTION public.curriculum_version_has_qualifying_grant(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.curriculum_version_has_qualifying_grant(uuid) TO authenticated, service_role;

-- The single authoritative activation gate for ordinary users.
CREATE OR REPLACE FUNCTION public.curriculum_version_is_available(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.curriculum_versions v
    WHERE v.id = p_version_id
      AND v.status = 'published'
      AND v.is_current
      AND v.content_readiness = 'complete'
      AND v.rights_status = 'authorized'
      AND v.activation_status = 'active'
      AND v.rights_reviewed_at IS NOT NULL
      AND public.curriculum_version_has_qualifying_grant(v.id)
  );
$$;
REVOKE ALL ON FUNCTION public.curriculum_version_is_available(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.curriculum_version_is_available(uuid) TO anon, authenticated, service_role;

-- rights_status = 'authorized' is not a freely editable label.
CREATE OR REPLACE FUNCTION app_private.enforce_curriculum_version_rights()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.rights_status = 'authorized' THEN
    IF NEW.rights_reviewed_at IS NULL OR NEW.rights_reviewed_by IS NULL THEN
      RAISE EXCEPTION 'rights_status=authorized requires a completed rights review';
    END IF;
    IF NOT public.curriculum_version_has_qualifying_grant(NEW.id) THEN
      RAISE EXCEPTION 'rights_status=authorized requires a reviewed, unexpired rights grant permitting commercial use, storage and authenticated display';
    END IF;
  END IF;

  IF NEW.activation_status = 'active'
     AND (NEW.rights_status <> 'authorized' OR NEW.content_readiness <> 'complete') THEN
    RAISE EXCEPTION 'a curriculum version can only be activated when rights are authorized and content readiness is complete';
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.rights_status IS DISTINCT FROM OLD.rights_status
    OR NEW.activation_status IS DISTINCT FROM OLD.activation_status
    OR NEW.content_readiness IS DISTINCT FROM OLD.content_readiness) THEN
    INSERT INTO public.rights_audit_log (entity_type, entity_id, action, actor_id, previous_state, new_state)
    VALUES ('curriculum_version', NEW.id, 'rights_state_change', auth.uid(),
            jsonb_build_object('rights_status', OLD.rights_status, 'activation_status', OLD.activation_status, 'content_readiness', OLD.content_readiness),
            jsonb_build_object('rights_status', NEW.rights_status, 'activation_status', NEW.activation_status, 'content_readiness', NEW.content_readiness));
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_version_rights() FROM PUBLIC;

CREATE TRIGGER curriculum_versions_enforce_rights
  BEFORE INSERT OR UPDATE ON public.curriculum_versions
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_curriculum_version_rights();

-- The published-version lock predates the governance columns above. Published
-- versions remain content-immutable, but an authorized reviewer must still be
-- able to record rights, readiness and activation decisions against them.
CREATE OR REPLACE FUNCTION app_private.enforce_curriculum_version_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status IN ('published','archived') THEN
      RAISE EXCEPTION 'curriculum version lifecycle violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft','review','published','archived') THEN
      RAISE EXCEPTION 'curriculum version lifecycle violation';
    END IF;
    IF NEW.is_current AND NEW.status <> 'published' THEN
      RAISE EXCEPTION 'curriculum version lifecycle violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'curriculum version lifecycle violation';
  END IF;

  IF OLD.status = 'published' THEN
    IF NEW.status NOT IN ('published','archived') THEN
      RAISE EXCEPTION 'curriculum version lifecycle violation';
    END IF;
    -- Content-bearing fields stay immutable in both cases.
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
    IF NEW.status = 'archived' THEN
      NEW.is_current := false;
    ELSIF NEW.is_current IS DISTINCT FROM OLD.is_current THEN
      -- Currency changes on a published version go through version promotion,
      -- not through a governance-field update.
      RAISE EXCEPTION 'curriculum version lifecycle violation';
    END IF;
    RETURN NEW;
  END IF;

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
REVOKE ALL ON FUNCTION app_private.enforce_curriculum_version_lifecycle() FROM PUBLIC;

-- ============================================================ 7. STANDARDS FRAMEWORKS (reserved)

CREATE TABLE IF NOT EXISTS public.standards_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  jurisdiction text,
  version_label text NOT NULL DEFAULT 'v1',
  source_artifact_id uuid REFERENCES public.source_artifacts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','approved','archived')),
  is_available boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.standards_frameworks TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.standards_frameworks TO authenticated;
GRANT ALL ON public.standards_frameworks TO service_role;
ALTER TABLE public.standards_frameworks ENABLE ROW LEVEL SECURITY;
CREATE POLICY standards_frameworks_read ON public.standards_frameworks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY standards_frameworks_write ON public.standards_frameworks
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());
CREATE TRIGGER standards_frameworks_set_updated_at BEFORE UPDATE ON public.standards_frameworks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.standards_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES public.standards_frameworks(id) ON DELETE CASCADE,
  parent_statement_id uuid REFERENCES public.standards_statements(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL,
  sequence_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (framework_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.standards_statements TO authenticated;
GRANT ALL ON public.standards_statements TO service_role;
ALTER TABLE public.standards_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY standards_statements_read ON public.standards_statements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY standards_statements_write ON public.standards_statements
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());
CREATE TRIGGER standards_statements_set_updated_at BEFORE UPDATE ON public.standards_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.objective_standard_crosswalk (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_objective_id uuid NOT NULL REFERENCES public.learning_objectives(id) ON DELETE CASCADE,
  standards_statement_id uuid NOT NULL REFERENCES public.standards_statements(id) ON DELETE CASCADE,
  alignment_strength text NOT NULL DEFAULT 'partial'
    CHECK (alignment_strength IN ('partial','strong','exact')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (learning_objective_id, standards_statement_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.objective_standard_crosswalk TO authenticated;
GRANT ALL ON public.objective_standard_crosswalk TO service_role;
ALTER TABLE public.objective_standard_crosswalk ENABLE ROW LEVEL SECURITY;
CREATE POLICY objective_standard_crosswalk_read ON public.objective_standard_crosswalk
  FOR SELECT TO authenticated USING (true);
CREATE POLICY objective_standard_crosswalk_write ON public.objective_standard_crosswalk
  FOR ALL TO authenticated
  USING (app_private.is_platform_admin())
  WITH CHECK (app_private.is_platform_admin());

-- ============================================================ 8. CBC GRADE 1-12 CORRECTION

-- Pre-Primary is out of approved CBC scope: keep the historical row, make it unavailable.
UPDATE public.education_stages
SET is_available = false,
    unavailable_reason = 'Out of approved CBC scope (Grades 1-12 only) - binding amendment 18 Aug 2026'
WHERE name = 'Pre-Primary';

DO $$
DECLARE
  v_curriculum uuid;
  v_primary uuid;
  v_junior uuid;
  v_senior uuid;
  v_status text;
  i integer;
BEGIN
  SELECT id INTO v_curriculum FROM public.curricula WHERE code = 'CBC';
  IF v_curriculum IS NULL THEN RETURN; END IF;

  SELECT es.id INTO v_primary FROM public.education_stages es
    JOIN public.curriculum_versions cv ON cv.id = es.curriculum_version_id
    WHERE cv.curriculum_id = v_curriculum AND es.name = 'Primary' AND cv.is_current;
  SELECT es.id INTO v_junior FROM public.education_stages es
    JOIN public.curriculum_versions cv ON cv.id = es.curriculum_version_id
    WHERE cv.curriculum_id = v_curriculum AND es.name = 'Junior Secondary' AND cv.is_current;
  SELECT es.id INTO v_senior FROM public.education_stages es
    JOIN public.curriculum_versions cv ON cv.id = es.curriculum_version_id
    WHERE cv.curriculum_id = v_curriculum AND es.name = 'Senior Secondary' AND cv.is_current;

  SELECT status INTO v_status FROM public.grades
    WHERE curriculum_id = v_curriculum ORDER BY sequence_order LIMIT 1;
  v_status := COALESCE(v_status, 'draft');

  FOR i IN 1..12 LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.grades
      WHERE curriculum_id = v_curriculum AND sequence_order = i
    ) THEN
      INSERT INTO public.grades
        (curriculum_id, name, sequence_order, pathway_required, education_stage_id, status, is_available)
      VALUES (
        v_curriculum,
        'Grade ' || i,
        i,
        i >= 10,
        CASE WHEN i <= 6 THEN v_primary WHEN i <= 9 THEN v_junior ELSE v_senior END,
        v_status,
        true
      );
    END IF;
  END LOOP;
END;
$$;

-- ============================================================ 9. CATALOGUE ENTRIES (configured, inactive)

DO $$
DECLARE
  r record;
  v_curriculum uuid;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('CAIE',      'CAIE-INTL',  'Cambridge International Curriculum',  'Configured - awaiting authorized curriculum data'),
      ('PEARSON',   'PEARSON-IE', 'Pearson Edexcel International Curriculum', 'Configured - awaiting authorized curriculum data'),
      ('LEARNFLOW', 'LF-USK12',   'LearnFlow U.S. K-12 Pathway',         'Configured - framework/source package pending')
    ) AS t(provider_code, curriculum_code, curriculum_name, note)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.curricula WHERE code = r.curriculum_code) THEN
      INSERT INTO public.curricula (code, name, provider_id)
      SELECT r.curriculum_code, r.curriculum_name, p.id
      FROM public.curriculum_providers p WHERE p.code = r.provider_code
      RETURNING id INTO v_curriculum;

      IF v_curriculum IS NOT NULL THEN
        INSERT INTO public.curriculum_versions
          (curriculum_id, label, status, is_current, content_readiness, rights_status, activation_status, availability_note)
        VALUES (v_curriculum, 'Baseline', 'draft', false, 'none', 'review_required', 'inactive', r.note);
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- CBC baseline: configured, rights review required, not active.
UPDATE public.curriculum_versions v
SET rights_status = 'review_required',
    content_readiness = 'partial',
    activation_status = 'inactive',
    availability_note = 'Configured - rights review required'
FROM public.curricula c
WHERE c.id = v.curriculum_id
  AND c.code = 'CBC'
  AND v.rights_status = 'unknown';

INSERT INTO public.standards_frameworks (code, name, jurisdiction, version_label, status, is_available)
VALUES ('US-K12-RESERVED', 'LearnFlow U.S. K-12 Standards Framework (reserved)', 'United States', 'v0', 'draft', false)
ON CONFLICT (code) DO NOTHING;

COMMIT;