-- ============================================================
-- STAGE 3 — PUBLIC WEBSITE (Phase 10E)
-- Additive only. No existing object is altered or dropped.
-- ============================================================

-- ---------- 0. Preconditions (fail closed) ----------
DO $$
BEGIN
  IF to_regnamespace('app_private') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: app_private schema is absent';
  END IF;
  IF to_regprocedure('app_private.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: app_private.is_platform_admin() is absent';
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION: public.update_updated_at_column() is absent';
  END IF;
  IF to_regclass('public.site_content') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECONDITION: Stage 3 tables already exist';
  END IF;
END
$$;

-- ---------- 1. Shared lifecycle enforcement ----------
CREATE OR REPLACE FUNCTION app_private.enforce_public_content_lifecycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'LIFECYCLE: public content must be created as draft';
    END IF;
    NEW.content_version := 1;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT (
      (OLD.status = 'draft'     AND NEW.status IN ('published','archived'))
      OR (OLD.status = 'published' AND NEW.status IN ('draft','archived'))
      OR (OLD.status = 'archived'  AND NEW.status = 'draft')
    ) THEN
      RAISE EXCEPTION 'LIFECYCLE: transition % -> % is not permitted', OLD.status, NEW.status;
    END IF;
    IF NEW.status = 'published' THEN
      NEW.published_at := now();
      NEW.archived_at := NULL;
    ELSIF NEW.status = 'archived' THEN
      NEW.archived_at := now();
    ELSE
      NEW.archived_at := NULL;
    END IF;
  END IF;

  -- Optimistic concurrency: callers send the version they read.
  IF NEW.content_version IS DISTINCT FROM OLD.content_version THEN
    RAISE EXCEPTION 'CONFLICT: content_version mismatch (expected %, got %)',
      OLD.content_version, NEW.content_version
      USING ERRCODE = '40001';
  END IF;
  NEW.content_version := OLD.content_version + 1;
  NEW.created_at := OLD.created_at;
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.enforce_public_content_lifecycle() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_private.reject_hard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE: % rows cannot be deleted; archive instead', TG_TABLE_NAME;
END;
$$;
REVOKE ALL ON FUNCTION app_private.reject_hard_delete() FROM PUBLIC;

-- ---------- 2. Append-only public-site audit ----------
CREATE TABLE public.public_site_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 64),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 64),
  actor_id uuid,
  previous_state jsonb,
  new_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX public_site_audit_log_entity_idx
  ON public.public_site_audit_log (entity_type, entity_id, created_at DESC);

GRANT SELECT, INSERT ON public.public_site_audit_log TO authenticated;
GRANT SELECT, INSERT ON public.public_site_audit_log TO service_role;
ALTER TABLE public.public_site_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_site_audit_read ON public.public_site_audit_log
  FOR SELECT TO authenticated USING (app_private.is_platform_admin());
CREATE POLICY public_site_audit_insert ON public.public_site_audit_log
  FOR INSERT TO authenticated WITH CHECK (app_private.is_platform_admin());

CREATE OR REPLACE FUNCTION app_private.reject_public_site_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'public_site_audit_log is append-only';
END;
$$;
REVOKE ALL ON FUNCTION app_private.reject_public_site_audit_mutation() FROM PUBLIC;
CREATE TRIGGER public_site_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.public_site_audit_log
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_public_site_audit_mutation();

CREATE OR REPLACE FUNCTION app_private.log_public_content_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.public_site_audit_log (entity_type, entity_id, action, actor_id, previous_state, new_state)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    lower(TG_OP),
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object('status', OLD.status, 'content_version', OLD.content_version) END,
    jsonb_build_object('status', NEW.status, 'content_version', NEW.content_version)
  );
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.log_public_content_change() FROM PUBLIC;

-- ---------- 3. Content tables ----------
CREATE TABLE public.site_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key text NOT NULL UNIQUE CHECK (content_key ~ '^[a-z0-9]+(?:[-_.][a-z0-9]+)*$' AND char_length(content_key) <= 96),
  page_slug text NOT NULL CHECK (page_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(page_slug) <= 64),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 500),
  body_markdown text NOT NULL DEFAULT '' CHECK (char_length(body_markdown) <= 40000),
  media_path text CHECK (media_path IS NULL OR char_length(media_path) <= 512),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 100000),
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.guide_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 500),
  body_markdown text NOT NULL DEFAULT '' CHECK (char_length(body_markdown) <= 80000),
  category text NOT NULL DEFAULT 'general' CHECK (char_length(category) BETWEEN 1 AND 64),
  tags text[] NOT NULL DEFAULT '{}' CHECK (array_length(tags, 1) IS NULL OR array_length(tags, 1) <= 12),
  reading_minutes integer CHECK (reading_minutes IS NULL OR reading_minutes BETWEEN 1 AND 240),
  hero_media_path text CHECK (hero_media_path IS NULL OR char_length(hero_media_path) <= 512),
  seo_description text CHECK (seo_description IS NULL OR char_length(seo_description) <= 300),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 100000),
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guide_articles_published_idx ON public.guide_articles (status, display_order, published_at DESC);

CREATE TABLE public.testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 120),
  author_role text CHECK (author_role IS NULL OR char_length(author_role) <= 120),
  author_location text CHECK (author_location IS NULL OR char_length(author_location) <= 120),
  quote text NOT NULL CHECK (char_length(quote) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 100000),
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 300),
  answer_markdown text NOT NULL CHECK (char_length(answer_markdown) BETWEEN 1 AND 8000),
  category text NOT NULL DEFAULT 'general' CHECK (char_length(category) BETWEEN 1 AND 64),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 100000),
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.merchandise_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) <= 120),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 1 AND 500),
  description_markdown text NOT NULL DEFAULT '' CHECK (char_length(description_markdown) <= 20000),
  price_amount numeric(12,2) CHECK (price_amount IS NULL OR (price_amount >= 0 AND price_amount <= 1000000)),
  price_currency text CHECK (price_currency IS NULL OR price_currency ~ '^[A-Z]{3}$'),
  availability_note text CHECK (availability_note IS NULL OR char_length(availability_note) <= 300),
  media_path text CHECK (media_path IS NULL OR char_length(media_path) <= 512),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  display_order integer NOT NULL DEFAULT 0 CHECK (display_order BETWEEN 0 AND 100000),
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version >= 1),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT merchandise_price_pairing CHECK ((price_amount IS NULL) = (price_currency IS NULL))
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_content','guide_articles','testimonials','faqs','merchandise_items'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO anon USING (status = 'published')$f$, t || '_anon_published_read', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (status = 'published' OR app_private.is_platform_admin())$f$, t || '_auth_read', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (app_private.is_platform_admin())$f$, t || '_admin_insert', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (app_private.is_platform_admin()) WITH CHECK (app_private.is_platform_admin())$f$, t || '_admin_update', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.enforce_public_content_lifecycle()', t || '_lifecycle', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.reject_hard_delete()', t || '_no_delete', t);
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION app_private.log_public_content_change()', t || '_audit', t);
  END LOOP;
END
$$;

-- ---------- 4. Durable rate limiting ----------
CREATE TABLE public.submission_throttle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 1 AND 64),
  bucket_key text NOT NULL CHECK (char_length(bucket_key) BETWEEN 16 AND 128),
  window_start timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds BETWEEN 1 AND 86400),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT submission_throttle_window_uniq UNIQUE (purpose, bucket_key, window_start)
);
CREATE INDEX submission_throttle_expiry_idx ON public.submission_throttle (expires_at);
GRANT ALL ON public.submission_throttle TO service_role;
ALTER TABLE public.submission_throttle ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated grant: throttle state is service-role only.

CREATE OR REPLACE FUNCTION app_private.consume_rate_limit(
  p_purpose text,
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_window_start timestamptz;
  v_count integer;
BEGIN
  IF p_purpose IS NULL OR p_bucket_key IS NULL OR p_limit IS NULL OR p_limit < 1
     OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RETURN QUERY SELECT false, p_window_seconds; -- fail closed
    RETURN;
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.submission_throttle (purpose, bucket_key, window_start, window_seconds, request_count, expires_at)
  VALUES (p_purpose, p_bucket_key, v_window_start, p_window_seconds, 1,
          v_window_start + make_interval(secs => p_window_seconds * 2))
  ON CONFLICT (purpose, bucket_key, window_start)
  DO UPDATE SET request_count = public.submission_throttle.request_count + 1,
                updated_at = now()
  RETURNING request_count INTO v_count;

  RETURN QUERY SELECT
    (v_count <= p_limit),
    GREATEST(1, CEIL(EXTRACT(epoch FROM (v_window_start + make_interval(secs => p_window_seconds)) - clock_timestamp()))::integer);
END;
$$;
REVOKE ALL ON FUNCTION app_private.consume_rate_limit(text, text, integer, integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_purpose text,
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM app_private.consume_rate_limit(p_purpose, p_bucket_key, p_limit, p_window_seconds);
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_throttle_windows()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_deleted integer;
BEGIN
  DELETE FROM public.submission_throttle WHERE expires_at < now();
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_throttle_windows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_throttle_windows() TO service_role;

-- ---------- 5. Public inquiries ----------
CREATE TABLE public.public_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_type text NOT NULL CHECK (inquiry_type IN ('contact','consultation','merchandise','instructor_application')),
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 160),
  email text NOT NULL CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' AND char_length(email) <= 254),
  phone text CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  subject text CHECK (subject IS NULL OR char_length(subject) BETWEEN 1 AND 200),
  message text NOT NULL CHECK (char_length(message) BETWEEN 10 AND 5000),
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(details) <= 8192),
  related_merchandise_id uuid REFERENCES public.merchandise_items(id) ON DELETE SET NULL,
  submitter_fingerprint text NOT NULL CHECK (submitter_fingerprint ~ '^[a-f0-9]{64}$'),
  ip_hash text NOT NULL CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  user_agent_family text CHECK (user_agent_family IS NULL OR char_length(user_agent_family) <= 64),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_review','responded','closed','spam')),
  handled_by uuid,
  handled_at timestamptz,
  handling_note text CHECK (handling_note IS NULL OR char_length(handling_note) <= 2000),
  retention_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- BINDING: fixed-UTC duplicate window (IMMUTABLE, index-legal).
CREATE INDEX public_inquiries_dedupe_hour_idx
ON public.public_inquiries (
  submitter_fingerprint,
  inquiry_type,
  date_trunc('hour', created_at AT TIME ZONE 'utc')
);
CREATE INDEX public_inquiries_status_idx ON public.public_inquiries (status, created_at DESC);
CREATE INDEX public_inquiries_retention_idx ON public.public_inquiries (retention_expires_at);

GRANT SELECT, UPDATE ON public.public_inquiries TO authenticated;
GRANT ALL ON public.public_inquiries TO service_role;
ALTER TABLE public.public_inquiries ENABLE ROW LEVEL SECURITY;
-- No anon policy at all: zero anonymous read-back and zero enumeration.
CREATE POLICY public_inquiries_admin_read ON public.public_inquiries
  FOR SELECT TO authenticated USING (app_private.is_platform_admin());
CREATE POLICY public_inquiries_admin_update ON public.public_inquiries
  FOR UPDATE TO authenticated USING (app_private.is_platform_admin()) WITH CHECK (app_private.is_platform_admin());

CREATE OR REPLACE FUNCTION app_private.enforce_public_inquiry_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.inquiry_type IS DISTINCT FROM OLD.inquiry_type
     OR NEW.full_name IS DISTINCT FROM OLD.full_name
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.phone IS DISTINCT FROM OLD.phone
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.submitter_fingerprint IS DISTINCT FROM OLD.submitter_fingerprint
     OR NEW.ip_hash IS DISTINCT FROM OLD.ip_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE: submitted inquiry content cannot be modified';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
      RAISE EXCEPTION 'LIFECYCLE: a closed inquiry cannot be reopened';
    END IF;
    NEW.handled_at := now();
    NEW.handled_by := auth.uid();
    INSERT INTO public.public_site_audit_log (entity_type, entity_id, action, actor_id, previous_state, new_state)
    VALUES ('public_inquiries', OLD.id, 'status_change', auth.uid(),
            jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.enforce_public_inquiry_immutability() FROM PUBLIC;
CREATE TRIGGER public_inquiries_immutable BEFORE UPDATE ON public.public_inquiries
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_public_inquiry_immutability();
CREATE TRIGGER public_inquiries_touch BEFORE UPDATE ON public.public_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER public_inquiries_no_delete BEFORE DELETE ON public.public_inquiries
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_hard_delete();

-- ---------- 6. Instructor application details ----------
CREATE TABLE public.instructor_application_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL UNIQUE REFERENCES public.public_inquiries(id) ON DELETE RESTRICT,
  subjects text[] NOT NULL DEFAULT '{}' CHECK (array_length(subjects, 1) IS NOT NULL AND array_length(subjects, 1) BETWEEN 1 AND 10),
  qualifications_summary text NOT NULL CHECK (char_length(qualifications_summary) BETWEEN 10 AND 4000),
  years_experience integer NOT NULL CHECK (years_experience BETWEEN 0 AND 60),
  document_paths text[] NOT NULL DEFAULT '{}' CHECK (array_length(document_paths, 1) IS NULL OR array_length(document_paths, 1) <= 3),
  malware_state text NOT NULL DEFAULT 'quarantined' CHECK (malware_state IN ('quarantined','clean','infected','unscannable')),
  application_status text NOT NULL DEFAULT 'submitted' CHECK (application_status IN ('submitted','screening','interview','accepted','declined','withdrawn')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text CHECK (decision_note IS NULL OR char_length(decision_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX instructor_application_status_idx ON public.instructor_application_details (application_status, created_at DESC);

GRANT SELECT, UPDATE ON public.instructor_application_details TO authenticated;
GRANT ALL ON public.instructor_application_details TO service_role;
ALTER TABLE public.instructor_application_details ENABLE ROW LEVEL SECURITY;
CREATE POLICY instructor_applications_admin_read ON public.instructor_application_details
  FOR SELECT TO authenticated USING (app_private.is_platform_admin());
CREATE POLICY instructor_applications_admin_update ON public.instructor_application_details
  FOR UPDATE TO authenticated USING (app_private.is_platform_admin()) WITH CHECK (app_private.is_platform_admin());

CREATE OR REPLACE FUNCTION app_private.enforce_instructor_application_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_type text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT inquiry_type INTO v_type FROM public.public_inquiries WHERE id = NEW.inquiry_id;
    IF v_type IS DISTINCT FROM 'instructor_application' THEN
      RAISE EXCEPTION 'CONSISTENCY: linked inquiry must be of type instructor_application';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.inquiry_id IS DISTINCT FROM OLD.inquiry_id
     OR NEW.subjects IS DISTINCT FROM OLD.subjects
     OR NEW.qualifications_summary IS DISTINCT FROM OLD.qualifications_summary
     OR NEW.years_experience IS DISTINCT FROM OLD.years_experience
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'IMMUTABLE: submitted applicant fields cannot be modified';
  END IF;

  IF NEW.application_status IS DISTINCT FROM OLD.application_status THEN
    IF OLD.application_status IN ('accepted','declined','withdrawn') THEN
      RAISE EXCEPTION 'LIFECYCLE: a decided application cannot change status';
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
    INSERT INTO public.public_site_audit_log (entity_type, entity_id, action, actor_id, previous_state, new_state)
    VALUES ('instructor_application_details', OLD.id, 'decision', auth.uid(),
            jsonb_build_object('application_status', OLD.application_status),
            jsonb_build_object('application_status', NEW.application_status));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.enforce_instructor_application_rules() FROM PUBLIC;
CREATE TRIGGER instructor_applications_rules BEFORE INSERT OR UPDATE ON public.instructor_application_details
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_instructor_application_rules();
CREATE TRIGGER instructor_applications_touch BEFORE UPDATE ON public.instructor_application_details
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER instructor_applications_no_delete BEFORE DELETE ON public.instructor_application_details
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_hard_delete();

-- ---------- 7. Newsletter ----------
CREATE TABLE public.newsletter_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized text NOT NULL UNIQUE CHECK (email_normalized = lower(email_normalized) AND char_length(email_normalized) <= 254),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','confirmed','unsubscribed','suppressed')),
  confirmation_token_hash text CHECK (confirmation_token_hash IS NULL OR confirmation_token_hash ~ '^[a-f0-9]{64}$'),
  token_expires_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  suppressed_at timestamptz,
  suppression_reason text CHECK (suppression_reason IS NULL OR char_length(suppression_reason) <= 200),
  consent_text_version text CHECK (consent_text_version IS NULL OR char_length(consent_text_version) <= 32),
  policy_version text CHECK (policy_version IS NULL OR char_length(policy_version) <= 32),
  retention_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_confirmed_requires_consent
    CHECK (state <> 'confirmed' OR (confirmed_at IS NOT NULL AND consent_text_version IS NOT NULL AND policy_version IS NOT NULL))
);
CREATE INDEX newsletter_state_idx ON public.newsletter_subscriptions (state, created_at DESC);

CREATE TABLE public.newsletter_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.newsletter_subscriptions(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('requested','confirmed','withdrawn','suppressed','resubscribed','admin_change')),
  consent_text text CHECK (consent_text IS NULL OR char_length(consent_text) <= 2000),
  consent_text_version text CHECK (consent_text_version IS NULL OR char_length(consent_text_version) <= 32),
  policy_version text CHECK (policy_version IS NULL OR char_length(policy_version) <= 32),
  actor_id uuid,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_column_size(evidence) <= 4096),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX newsletter_consent_events_sub_idx ON public.newsletter_consent_events (subscription_id, occurred_at DESC);

GRANT SELECT, UPDATE ON public.newsletter_subscriptions TO authenticated;
GRANT ALL ON public.newsletter_subscriptions TO service_role;
ALTER TABLE public.newsletter_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_admin_read ON public.newsletter_subscriptions
  FOR SELECT TO authenticated USING (app_private.is_platform_admin());
CREATE POLICY newsletter_admin_update ON public.newsletter_subscriptions
  FOR UPDATE TO authenticated USING (app_private.is_platform_admin()) WITH CHECK (app_private.is_platform_admin());

GRANT SELECT ON public.newsletter_consent_events TO authenticated;
GRANT SELECT, INSERT ON public.newsletter_consent_events TO service_role;
ALTER TABLE public.newsletter_consent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY newsletter_consent_admin_read ON public.newsletter_consent_events
  FOR SELECT TO authenticated USING (app_private.is_platform_admin());

CREATE OR REPLACE FUNCTION app_private.reject_newsletter_consent_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'newsletter_consent_events is append-only';
END;
$$;
REVOKE ALL ON FUNCTION app_private.reject_newsletter_consent_mutation() FROM PUBLIC;
CREATE TRIGGER newsletter_consent_events_immutable BEFORE UPDATE OR DELETE ON public.newsletter_consent_events
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_newsletter_consent_mutation();
CREATE TRIGGER newsletter_subscriptions_touch BEFORE UPDATE ON public.newsletter_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER newsletter_subscriptions_no_delete BEFORE DELETE ON public.newsletter_subscriptions
  FOR EACH ROW EXECUTE FUNCTION app_private.reject_hard_delete();

-- ---------- 8. Server-only public write boundary ----------
CREATE OR REPLACE FUNCTION app_private.submit_public_inquiry(
  p_inquiry_type text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_details jsonb,
  p_related_merchandise_id uuid,
  p_fingerprint text,
  p_ip_hash text,
  p_user_agent_family text,
  p_retention_days integer,
  p_instructor jsonb
) RETURNS TABLE (inquiry_id uuid, duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_existing uuid;
  v_id uuid;
BEGIN
  IF p_retention_days IS NULL OR p_retention_days < 1 OR p_retention_days > 3650 THEN
    RAISE EXCEPTION 'VALIDATION: retention_days out of bounds';
  END IF;

  -- Serialize the duplicate window per fingerprint so concurrent submissions cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_fingerprint || ':' || p_inquiry_type, 0));

  SELECT i.id INTO v_existing
  FROM public.public_inquiries i
  WHERE i.submitter_fingerprint = p_fingerprint
    AND i.inquiry_type = p_inquiry_type
    AND date_trunc('hour', i.created_at AT TIME ZONE 'utc')
        = date_trunc('hour', now() AT TIME ZONE 'utc')
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN QUERY SELECT v_existing, true;
    RETURN;
  END IF;

  INSERT INTO public.public_inquiries (
    inquiry_type, full_name, email, phone, subject, message, details,
    related_merchandise_id, submitter_fingerprint, ip_hash, user_agent_family, retention_expires_at
  ) VALUES (
    p_inquiry_type, p_full_name, lower(p_email), p_phone, p_subject, p_message,
    COALESCE(p_details, '{}'::jsonb), p_related_merchandise_id, p_fingerprint, p_ip_hash,
    p_user_agent_family, now() + make_interval(days => p_retention_days)
  ) RETURNING id INTO v_id;

  IF p_inquiry_type = 'instructor_application' THEN
    IF p_instructor IS NULL THEN
      RAISE EXCEPTION 'VALIDATION: instructor application details are required';
    END IF;
    INSERT INTO public.instructor_application_details (
      inquiry_id, subjects, qualifications_summary, years_experience, document_paths
    ) VALUES (
      v_id,
      ARRAY(SELECT jsonb_array_elements_text(p_instructor -> 'subjects')),
      p_instructor ->> 'qualifications_summary',
      (p_instructor ->> 'years_experience')::integer,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_instructor -> 'document_paths')), '{}')
    );
  END IF;

  INSERT INTO public.public_site_audit_log (entity_type, entity_id, action, actor_id, new_state)
  VALUES ('public_inquiries', v_id, 'submitted', NULL, jsonb_build_object('inquiry_type', p_inquiry_type));

  RETURN QUERY SELECT v_id, false;
END;
$$;
REVOKE ALL ON FUNCTION app_private.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.submit_public_inquiry(
  p_inquiry_type text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_subject text,
  p_message text,
  p_details jsonb,
  p_related_merchandise_id uuid,
  p_fingerprint text,
  p_ip_hash text,
  p_user_agent_family text,
  p_retention_days integer,
  p_instructor jsonb
) RETURNS TABLE (inquiry_id uuid, duplicate boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM app_private.submit_public_inquiry(
    p_inquiry_type, p_full_name, p_email, p_phone, p_subject, p_message, p_details,
    p_related_merchandise_id, p_fingerprint, p_ip_hash, p_user_agent_family,
    p_retention_days, p_instructor);
$$;
REVOKE ALL ON FUNCTION public.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_inquiry(text,text,text,text,text,text,jsonb,uuid,text,text,text,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION app_private.request_newsletter_subscription(
  p_email text,
  p_token_hash text,
  p_token_ttl_minutes integer,
  p_consent_text text,
  p_consent_text_version text,
  p_policy_version text,
  p_evidence jsonb
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_email text := lower(btrim(p_email));
  v_id uuid;
  v_state text;
BEGIN
  IF p_token_ttl_minutes IS NULL OR p_token_ttl_minutes < 5 OR p_token_ttl_minutes > 10080 THEN
    RAISE EXCEPTION 'VALIDATION: token ttl out of bounds';
  END IF;

  SELECT id, state INTO v_id, v_state
  FROM public.newsletter_subscriptions WHERE email_normalized = v_email;

  IF v_id IS NULL THEN
    INSERT INTO public.newsletter_subscriptions (
      email_normalized, state, confirmation_token_hash, token_expires_at,
      consent_text_version, policy_version)
    VALUES (v_email, 'pending', p_token_hash,
            now() + make_interval(mins => p_token_ttl_minutes),
            p_consent_text_version, p_policy_version)
    RETURNING id INTO v_id;
    v_state := 'pending';
  ELSIF v_state = 'suppressed' THEN
    -- Suppressed addresses are never silently resubscribed.
    RETURN 'suppressed';
  ELSIF v_state = 'confirmed' THEN
    RETURN 'already_confirmed';
  ELSE
    -- pending or unsubscribed: a fresh consent request replaces the old token.
    UPDATE public.newsletter_subscriptions
       SET state = 'pending',
           confirmation_token_hash = p_token_hash,
           token_expires_at = now() + make_interval(mins => p_token_ttl_minutes),
           consent_text_version = p_consent_text_version,
           policy_version = p_policy_version,
           unsubscribed_at = NULL
     WHERE id = v_id;
  END IF;

  INSERT INTO public.newsletter_consent_events (
    subscription_id, event_type, consent_text, consent_text_version, policy_version, evidence)
  VALUES (v_id, 'requested', p_consent_text, p_consent_text_version, p_policy_version,
          COALESCE(p_evidence, '{}'::jsonb));

  RETURN 'pending';
END;
$$;
REVOKE ALL ON FUNCTION app_private.request_newsletter_subscription(text,text,integer,text,text,text,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.request_newsletter_subscription(
  p_email text, p_token_hash text, p_token_ttl_minutes integer,
  p_consent_text text, p_consent_text_version text, p_policy_version text, p_evidence jsonb
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.request_newsletter_subscription(
    p_email, p_token_hash, p_token_ttl_minutes, p_consent_text,
    p_consent_text_version, p_policy_version, p_evidence);
$$;
REVOKE ALL ON FUNCTION public.request_newsletter_subscription(text,text,integer,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_newsletter_subscription(text,text,integer,text,text,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION app_private.confirm_newsletter_subscription(
  p_token_hash text, p_retention_days integer, p_evidence jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid; v_state text; v_expires timestamptz;
BEGIN
  SELECT id, state, token_expires_at INTO v_id, v_state, v_expires
  FROM public.newsletter_subscriptions WHERE confirmation_token_hash = p_token_hash;

  IF v_id IS NULL THEN
    RETURN 'invalid';               -- non-enumerating: caller returns a generic result
  END IF;
  IF v_state = 'confirmed' THEN
    RETURN 'confirmed';             -- idempotent
  END IF;
  IF v_expires IS NULL OR v_expires < now() THEN
    RETURN 'expired';
  END IF;

  UPDATE public.newsletter_subscriptions
     SET state = 'confirmed', confirmed_at = now(),
         confirmation_token_hash = NULL, token_expires_at = NULL,
         retention_expires_at = now() + make_interval(days => COALESCE(p_retention_days, 1095))
   WHERE id = v_id;

  INSERT INTO public.newsletter_consent_events (subscription_id, event_type, evidence)
  VALUES (v_id, 'confirmed', COALESCE(p_evidence, '{}'::jsonb));
  RETURN 'confirmed';
END;
$$;
REVOKE ALL ON FUNCTION app_private.confirm_newsletter_subscription(text,integer,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.confirm_newsletter_subscription(
  p_token_hash text, p_retention_days integer, p_evidence jsonb
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.confirm_newsletter_subscription(p_token_hash, p_retention_days, p_evidence);
$$;
REVOKE ALL ON FUNCTION public.confirm_newsletter_subscription(text,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_newsletter_subscription(text,integer,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION app_private.withdraw_newsletter_subscription(
  p_email_hash_or_token text, p_evidence jsonb
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.newsletter_subscriptions
   WHERE confirmation_token_hash = p_email_hash_or_token;

  IF v_id IS NULL THEN
    -- Always report the same outcome: withdrawal must never confirm existence.
    RETURN 'withdrawn';
  END IF;

  UPDATE public.newsletter_subscriptions
     SET state = 'unsubscribed', unsubscribed_at = now(),
         confirmation_token_hash = NULL, token_expires_at = NULL
   WHERE id = v_id AND state <> 'unsubscribed';

  INSERT INTO public.newsletter_consent_events (subscription_id, event_type, evidence)
  VALUES (v_id, 'withdrawn', COALESCE(p_evidence, '{}'::jsonb));
  RETURN 'withdrawn';
END;
$$;
REVOKE ALL ON FUNCTION app_private.withdraw_newsletter_subscription(text,jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.withdraw_newsletter_subscription(
  p_email_hash_or_token text, p_evidence jsonb
) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT app_private.withdraw_newsletter_subscription(p_email_hash_or_token, p_evidence);
$$;
REVOKE ALL ON FUNCTION public.withdraw_newsletter_subscription(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_newsletter_subscription(text,jsonb) TO service_role;

-- ---------- 9. Storage policies for the adopted private bucket ----------
CREATE OR REPLACE FUNCTION app_private.is_instructor_application_path(p_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT p_name ~ '^applications/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-z0-9]{32}\.[a-z0-9]{2,5}$';
$$;
REVOKE ALL ON FUNCTION app_private.is_instructor_application_path(text) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'instructor-applications') THEN
    -- Platform Administrators may read; nobody else gets any direct access.
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                     AND policyname = 'instructor_applications_platform_admin_read') THEN
      CREATE POLICY instructor_applications_platform_admin_read ON storage.objects
        FOR SELECT TO authenticated
        USING (bucket_id = 'instructor-applications' AND app_private.is_platform_admin());
    END IF;
  ELSE
    RAISE EXCEPTION 'PRECONDITION: private bucket instructor-applications is absent';
  END IF;
END
$$;

-- ---------- 10. Retention cleanup ----------
CREATE OR REPLACE FUNCTION public.purge_expired_public_submissions()
RETURNS TABLE (inquiries_redacted integer, newsletters_purged integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_i integer := 0; v_n integer := 0;
BEGIN
  -- Retention closes and de-identifies; it never hard-deletes evidence rows.
  UPDATE public.public_inquiries
     SET status = 'closed', handling_note = 'retention expired'
   WHERE retention_expires_at < now() AND status <> 'closed';
  GET DIAGNOSTICS v_i = ROW_COUNT;

  UPDATE public.newsletter_subscriptions
     SET state = 'suppressed', suppressed_at = now(), suppression_reason = 'retention expired'
   WHERE retention_expires_at IS NOT NULL AND retention_expires_at < now() AND state <> 'suppressed';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.public_site_audit_log (entity_type, entity_id, action, new_state)
  VALUES ('retention', gen_random_uuid(), 'purge',
          jsonb_build_object('inquiries', v_i, 'newsletters', v_n));

  RETURN QUERY SELECT v_i, v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_public_submissions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_expired_public_submissions() TO service_role;

-- ---------- 11. Postconditions (fail closed) ----------
DO $$
DECLARE v_def text;
BEGIN
  IF to_regclass('public.site_content') IS NULL
     OR to_regclass('public.guide_articles') IS NULL
     OR to_regclass('public.testimonials') IS NULL
     OR to_regclass('public.faqs') IS NULL
     OR to_regclass('public.merchandise_items') IS NULL
     OR to_regclass('public.public_inquiries') IS NULL
     OR to_regclass('public.instructor_application_details') IS NULL
     OR to_regclass('public.submission_throttle') IS NULL
     OR to_regclass('public.newsletter_subscriptions') IS NULL
     OR to_regclass('public.newsletter_consent_events') IS NULL THEN
    RAISE EXCEPTION 'POSTCONDITION: a Stage 3 table is missing';
  END IF;

  SELECT pg_get_indexdef(oid) INTO v_def FROM pg_class WHERE relname = 'public_inquiries_dedupe_hour_idx';
  IF v_def IS NULL OR position('''utc''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'POSTCONDITION: dedupe index does not use the fixed UTC expression: %', v_def;
  END IF;
END
$$;
