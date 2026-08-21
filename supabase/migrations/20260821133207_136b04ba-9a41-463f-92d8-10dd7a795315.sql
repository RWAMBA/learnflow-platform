INSERT INTO supabase_migrations.schema_migrations (version)
SELECT v FROM (VALUES ('20260818175500'), ('20260820190500')) AS t(v)
WHERE NOT EXISTS (
  SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = t.v
);