BEGIN;

-- Move the rights-grant probe out of the exposed API schema entirely.
CREATE OR REPLACE FUNCTION app_private.curriculum_version_has_qualifying_grant(p_version_id uuid)
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
REVOKE ALL ON FUNCTION app_private.curriculum_version_has_qualifying_grant(uuid) FROM PUBLIC;

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
      AND app_private.curriculum_version_has_qualifying_grant(v.id)
  );
$$;
REVOKE ALL ON FUNCTION public.curriculum_version_is_available(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.curriculum_version_is_available(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.curriculum_version_is_available(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.enforce_curriculum_version_rights()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.rights_status = 'authorized' THEN
    IF NEW.rights_reviewed_at IS NULL OR NEW.rights_reviewed_by IS NULL THEN
      RAISE EXCEPTION 'rights_status=authorized requires a completed rights review';
    END IF;
    IF NOT app_private.curriculum_version_has_qualifying_grant(NEW.id) THEN
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

DROP FUNCTION IF EXISTS public.curriculum_version_has_qualifying_grant(uuid);

COMMIT;