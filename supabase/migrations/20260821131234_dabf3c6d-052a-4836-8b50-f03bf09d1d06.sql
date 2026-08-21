-- Pin the search path of the evidence path-format checker (pure regex, no
-- object references, so behaviour is unchanged).
CREATE OR REPLACE FUNCTION app_private.is_rights_evidence_path(p_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
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

-- The audit-trail helper only ever runs as a trigger; nobody may call it.
REVOKE ALL ON FUNCTION app_private.log_rights_evidence_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.log_rights_evidence_change() FROM anon;
REVOKE ALL ON FUNCTION app_private.log_rights_evidence_change() FROM authenticated;
REVOKE ALL ON FUNCTION app_private.validate_rights_evidence_document() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.validate_rights_evidence_document() FROM anon;
REVOKE ALL ON FUNCTION app_private.validate_rights_evidence_document() FROM authenticated;