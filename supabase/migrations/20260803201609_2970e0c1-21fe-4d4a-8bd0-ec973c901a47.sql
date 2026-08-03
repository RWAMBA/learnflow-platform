CREATE POLICY "curriculum_resources_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'curriculum-resources'
  AND (storage.foldername(name))[1]::uuid IN (SELECT app_private.auth_organization_ids())
);

CREATE POLICY "curriculum_resources_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'curriculum-resources'
  AND app_private.can_author_curriculum((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "curriculum_resources_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'curriculum-resources'
  AND app_private.can_author_curriculum((storage.foldername(name))[1]::uuid)
)
WITH CHECK (
  bucket_id = 'curriculum-resources'
  AND app_private.can_author_curriculum((storage.foldername(name))[1]::uuid)
);

CREATE POLICY "curriculum_resources_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'curriculum-resources'
  AND app_private.can_author_curriculum((storage.foldername(name))[1]::uuid)
);