-- Stage 3 remediation: identify expired instructor-upload objects that were
-- never attached to an application so the authenticated retention worker can
-- remove them through the Storage API. A 24-hour grace period is deliberately
-- longer than the 15-minute upload-claim lifetime.

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL
     OR to_regclass('public.instructor_application_details') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: instructor application Storage objects are absent';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app_private.list_expired_unattached_instructor_uploads(
  p_limit integer DEFAULT 500
)
RETURNS TABLE (object_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'VALIDATION: abandoned-upload limit is invalid';
  END IF;

  RETURN QUERY
  SELECT o.name
  FROM storage.objects o
  WHERE o.bucket_id = 'instructor-applications'
    AND o.created_at < now() - interval '24 hours'
    AND o.name ~ '^applications/[0-9a-f-]{36}/[a-z0-9]{32}\.(pdf|docx)$'
    AND NOT EXISTS (
      SELECT 1
      FROM public.instructor_application_details d
      WHERE o.name = ANY(d.document_paths)
    )
  ORDER BY o.created_at, o.name
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION app_private.list_expired_unattached_instructor_uploads(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.list_expired_unattached_instructor_uploads(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.list_expired_unattached_instructor_uploads(
  p_limit integer DEFAULT 500
)
RETURNS TABLE (object_path text)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT *
  FROM app_private.list_expired_unattached_instructor_uploads(p_limit);
$$;

REVOKE ALL ON FUNCTION public.list_expired_unattached_instructor_uploads(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_expired_unattached_instructor_uploads(integer)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege(
       'anon',
       'public.list_expired_unattached_instructor_uploads(integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.list_expired_unattached_instructor_uploads(integer)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.list_expired_unattached_instructor_uploads(integer)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'POSTCONDITION: abandoned-upload RPC privilege boundary is incorrect';
  END IF;
END
$$;
