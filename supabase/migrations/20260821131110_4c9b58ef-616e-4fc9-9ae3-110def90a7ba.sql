-- Stage 1 closure hardening: anonymous principals must be denied at the grant
-- layer as well as by RLS on the new rights-evidence records table.
REVOKE ALL ON TABLE public.rights_evidence_documents FROM anon;
REVOKE ALL ON TABLE public.rights_evidence_documents FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rights_evidence_documents TO authenticated;
GRANT ALL ON public.rights_evidence_documents TO service_role;