
-- ============================================================
-- Assessments & Examinations module (additive)
-- ============================================================

-- Helper: may the caller grade / author assessments in an org?
CREATE OR REPLACE FUNCTION app_private.can_grade_in_org(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT app_private.is_platform_admin()
      OR app_private.has_org_role(p_org_id, 'teacher')
      OR app_private.has_org_role(p_org_id, 'tutor')
      OR app_private.has_org_role(p_org_id, 'org_admin');
$$;

-- Helper: is this student the caller themselves?
CREATE OR REPLACE FUNCTION app_private.is_self_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.user_roles ur ON ur.id = s.user_role_id
    WHERE s.id = p_student_id
      AND ur.user_id = auth.uid()
      AND ur.status = 'active'
  );
$$;

-- Helper: does the caller belong to this org (or is platform admin)?
CREATE OR REPLACE FUNCTION app_private.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT app_private.is_platform_admin()
      OR p_org_id IS NULL
      OR p_org_id IN (SELECT app_private.auth_organization_ids());
$$;

-- ------------------------------------------------------------
-- assessment_types
-- ------------------------------------------------------------
CREATE TABLE public.assessment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'formative',
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sequence_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assessment_types_scope_code_idx
  ON public.assessment_types (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_types TO authenticated;
GRANT ALL ON public.assessment_types TO service_role;
ALTER TABLE public.assessment_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessment_types_select ON public.assessment_types
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR app_private.is_org_member(organization_id));
CREATE POLICY assessment_types_insert ON public.assessment_types
  FOR INSERT TO authenticated
  WITH CHECK (organization_id IS NOT NULL AND app_private.can_grade_in_org(organization_id) AND is_system = false);
CREATE POLICY assessment_types_update ON public.assessment_types
  FOR UPDATE TO authenticated
  USING (organization_id IS NOT NULL AND app_private.can_grade_in_org(organization_id))
  WITH CHECK (organization_id IS NOT NULL AND app_private.can_grade_in_org(organization_id));
CREATE POLICY assessment_types_delete ON public.assessment_types
  FOR DELETE TO authenticated
  USING (organization_id IS NOT NULL AND is_system = false AND app_private.can_grade_in_org(organization_id));

CREATE TRIGGER assessment_types_set_updated_at BEFORE UPDATE ON public.assessment_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.assessment_types (organization_id, code, name, description, category, is_system, sequence_order) VALUES
  (NULL, 'practice_exercise', 'Practice Exercise', 'Low-stakes practice work', 'formative', true, 10),
  (NULL, 'quiz', 'Quiz', 'Short auto-gradable quiz', 'formative', true, 20),
  (NULL, 'assignment_assessment', 'Assignment Assessment', 'Graded assignment', 'formative', true, 30),
  (NULL, 'project_assessment', 'Project Assessment', 'Extended project work', 'summative', true, 40),
  (NULL, 'oral_assessment', 'Oral Assessment', 'Spoken assessment', 'formative', true, 50),
  (NULL, 'observation_assessment', 'Observation Assessment', 'Teacher observation record', 'formative', true, 60),
  (NULL, 'portfolio_assessment', 'Portfolio Assessment', 'Collected evidence of learning', 'summative', true, 70),
  (NULL, 'practical_assessment', 'Practical Assessment', 'Hands-on practical task', 'formative', true, 80),
  (NULL, 'continuous_assessment', 'Continuous Assessment', 'Ongoing continuous assessment', 'continuous', true, 90),
  (NULL, 'mid_term_exam', 'Mid-Term Examination', 'Mid-term examination', 'examination', true, 100),
  (NULL, 'end_term_exam', 'End-Term Examination', 'End of term examination', 'examination', true, 110),
  (NULL, 'mock_exam', 'Mock Examination', 'Mock examination', 'examination', true, 120),
  (NULL, 'national_exam', 'National Examination', 'National examination placeholder', 'examination', true, 130),
  (NULL, 'diagnostic_assessment', 'Diagnostic Assessment', 'Diagnoses learning gaps', 'diagnostic', true, 140),
  (NULL, 'baseline_assessment', 'Baseline Assessment', 'Establishes a baseline', 'diagnostic', true, 150),
  (NULL, 'competency_assessment', 'Competency Assessment', 'Competency-based assessment', 'competency', true, 160);

-- ------------------------------------------------------------
-- assessment_definitions
-- ------------------------------------------------------------
CREATE TABLE public.assessment_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assessment_type_id uuid REFERENCES public.assessment_types(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  instructions text,
  student_instructions text,
  teacher_notes text,
  curriculum_id uuid REFERENCES public.curricula(id) ON DELETE SET NULL,
  curriculum_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE SET NULL,
  grade_id uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  strand_id uuid REFERENCES public.strands(id) ON DELETE SET NULL,
  sub_strand_id uuid REFERENCES public.sub_strands(id) ON DELETE SET NULL,
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE SET NULL,
  rubric_id uuid,
  status text NOT NULL DEFAULT 'draft',
  max_score numeric NOT NULL DEFAULT 100,
  passing_score numeric,
  weighting numeric NOT NULL DEFAULT 1,
  estimated_minutes integer,
  due_at timestamptz,
  available_from timestamptz,
  available_until timestamptz,
  time_limit_minutes integer,
  attempts_allowed integer NOT NULL DEFAULT 1,
  randomize_questions boolean NOT NULL DEFAULT false,
  randomize_options boolean NOT NULL DEFAULT false,
  late_submission_allowed boolean NOT NULL DEFAULT true,
  late_penalty_percent numeric NOT NULL DEFAULT 0,
  parent_visible boolean NOT NULL DEFAULT true,
  allow_review boolean NOT NULL DEFAULT true,
  auto_grade boolean NOT NULL DEFAULT true,
  is_template boolean NOT NULL DEFAULT false,
  cloned_from_id uuid REFERENCES public.assessment_definitions(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assessment_definitions_status_check CHECK (status IN
    ('draft','review','scheduled','published','open','in_progress','submitted','grading','reviewed','completed','archived'))
);
CREATE INDEX assessment_definitions_org_idx ON public.assessment_definitions (organization_id, status);
CREATE INDEX assessment_definitions_subject_idx ON public.assessment_definitions (subject_id);
CREATE INDEX assessment_definitions_grade_idx ON public.assessment_definitions (grade_id);
CREATE INDEX assessment_definitions_lesson_idx ON public.assessment_definitions (lesson_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_definitions TO authenticated;
GRANT ALL ON public.assessment_definitions TO service_role;
ALTER TABLE public.assessment_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessment_definitions_select ON public.assessment_definitions
  FOR SELECT TO authenticated USING (app_private.is_org_member(organization_id));
CREATE POLICY assessment_definitions_insert ON public.assessment_definitions
  FOR INSERT TO authenticated WITH CHECK (app_private.can_grade_in_org(organization_id));
CREATE POLICY assessment_definitions_update ON public.assessment_definitions
  FOR UPDATE TO authenticated
  USING (app_private.can_grade_in_org(organization_id))
  WITH CHECK (app_private.can_grade_in_org(organization_id));
CREATE POLICY assessment_definitions_delete ON public.assessment_definitions
  FOR DELETE TO authenticated USING (app_private.can_grade_in_org(organization_id));

CREATE TRIGGER assessment_definitions_set_updated_at BEFORE UPDATE ON public.assessment_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- curriculum linkage (m2m)
-- ------------------------------------------------------------
CREATE TABLE public.assessment_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessment_definitions(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.competencies(id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, competency_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_competencies TO authenticated;
GRANT ALL ON public.assessment_competencies TO service_role;
ALTER TABLE public.assessment_competencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY assessment_competencies_select ON public.assessment_competencies
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.is_org_member(a.organization_id)));
CREATE POLICY assessment_competencies_write ON public.assessment_competencies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.can_grade_in_org(a.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.can_grade_in_org(a.organization_id)));

CREATE TABLE public.assessment_learning_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessment_definitions(id) ON DELETE CASCADE,
  learning_outcome_id uuid NOT NULL REFERENCES public.learning_outcomes(id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, learning_outcome_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_learning_outcomes TO authenticated;
GRANT ALL ON public.assessment_learning_outcomes TO service_role;
ALTER TABLE public.assessment_learning_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY assessment_learning_outcomes_select ON public.assessment_learning_outcomes
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.is_org_member(a.organization_id)));
CREATE POLICY assessment_learning_outcomes_write ON public.assessment_learning_outcomes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.can_grade_in_org(a.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.can_grade_in_org(a.organization_id)));

-- ------------------------------------------------------------
-- question bank
-- ------------------------------------------------------------
CREATE TABLE public.question_bank_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  question_type text NOT NULL,
  prompt text NOT NULL,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  answer_key jsonb,
  explanation text,
  points numeric NOT NULL DEFAULT 1,
  difficulty text NOT NULL DEFAULT 'medium',
  category text,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  parent_question_id uuid REFERENCES public.question_bank_items(id) ON DELETE SET NULL,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  grade_id uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  strand_id uuid REFERENCES public.strands(id) ON DELETE SET NULL,
  sub_strand_id uuid REFERENCES public.sub_strands(id) ON DELETE SET NULL,
  learning_outcome_id uuid REFERENCES public.learning_outcomes(id) ON DELETE SET NULL,
  competency_id uuid REFERENCES public.competencies(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_bank_items_type_check CHECK (question_type IN
    ('multiple_choice','multiple_response','true_false','short_answer','long_answer','essay',
     'fill_blank','matching','ordering','numeric','file_upload','drawing','audio_response','video_response')),
  CONSTRAINT question_bank_items_difficulty_check CHECK (difficulty IN ('easy','medium','hard')),
  CONSTRAINT question_bank_items_status_check CHECK (status IN ('draft','review','published','archived'))
);
CREATE INDEX question_bank_items_org_idx ON public.question_bank_items (organization_id, status);
CREATE INDEX question_bank_items_subject_idx ON public.question_bank_items (subject_id);
CREATE INDEX question_bank_items_tags_idx ON public.question_bank_items USING gin (tags);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bank_items TO authenticated;
GRANT ALL ON public.question_bank_items TO service_role;
ALTER TABLE public.question_bank_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY question_bank_items_select ON public.question_bank_items
  FOR SELECT TO authenticated USING (app_private.is_org_member(organization_id));
CREATE POLICY question_bank_items_write ON public.question_bank_items
  FOR ALL TO authenticated
  USING (app_private.can_grade_in_org(organization_id))
  WITH CHECK (app_private.can_grade_in_org(organization_id));
CREATE TRIGGER question_bank_items_set_updated_at BEFORE UPDATE ON public.question_bank_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assessment_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.assessment_definitions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.question_bank_items(id) ON DELETE CASCADE,
  sequence_order integer NOT NULL DEFAULT 0,
  points_override numeric,
  required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_id)
);
CREATE INDEX assessment_questions_assessment_idx ON public.assessment_questions (assessment_id, sequence_order);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_questions TO authenticated;
GRANT ALL ON public.assessment_questions TO service_role;
ALTER TABLE public.assessment_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY assessment_questions_select ON public.assessment_questions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.is_org_member(a.organization_id)));
CREATE POLICY assessment_questions_write ON public.assessment_questions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.can_grade_in_org(a.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessment_definitions a WHERE a.id = assessment_id AND app_private.can_grade_in_org(a.organization_id)));

-- ------------------------------------------------------------
-- rubrics
-- ------------------------------------------------------------
CREATE TABLE public.rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  is_template boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rubrics_status_check CHECK (status IN ('draft','review','published','archived'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubrics TO authenticated;
GRANT ALL ON public.rubrics TO service_role;
ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY rubrics_select ON public.rubrics
  FOR SELECT TO authenticated USING (app_private.is_org_member(organization_id));
CREATE POLICY rubrics_write ON public.rubrics
  FOR ALL TO authenticated
  USING (app_private.can_grade_in_org(organization_id))
  WITH CHECK (app_private.can_grade_in_org(organization_id));
CREATE TRIGGER rubrics_set_updated_at BEFORE UPDATE ON public.rubrics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.assessment_definitions
  ADD CONSTRAINT assessment_definitions_rubric_fk
  FOREIGN KEY (rubric_id) REFERENCES public.rubrics(id) ON DELETE SET NULL;

CREATE TABLE public.rubric_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rubric_id uuid NOT NULL REFERENCES public.rubrics(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  competency_id uuid REFERENCES public.competencies(id) ON DELETE SET NULL,
  learning_outcome_id uuid REFERENCES public.learning_outcomes(id) ON DELETE SET NULL,
  max_points numeric NOT NULL DEFAULT 4,
  sequence_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_criteria TO authenticated;
GRANT ALL ON public.rubric_criteria TO service_role;
ALTER TABLE public.rubric_criteria ENABLE ROW LEVEL SECURITY;
CREATE POLICY rubric_criteria_select ON public.rubric_criteria
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.rubrics r WHERE r.id = rubric_id AND app_private.is_org_member(r.organization_id)));
CREATE POLICY rubric_criteria_write ON public.rubric_criteria
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rubrics r WHERE r.id = rubric_id AND app_private.can_grade_in_org(r.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rubrics r WHERE r.id = rubric_id AND app_private.can_grade_in_org(r.organization_id)));
CREATE TRIGGER rubric_criteria_set_updated_at BEFORE UPDATE ON public.rubric_criteria
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.rubric_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id uuid NOT NULL REFERENCES public.rubric_criteria(id) ON DELETE CASCADE,
  label text NOT NULL,
  descriptor text,
  points numeric NOT NULL DEFAULT 0,
  sequence_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubric_levels TO authenticated;
GRANT ALL ON public.rubric_levels TO service_role;
ALTER TABLE public.rubric_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY rubric_levels_select ON public.rubric_levels
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.rubric_criteria c JOIN public.rubrics r ON r.id = c.rubric_id
    WHERE c.id = criterion_id AND app_private.is_org_member(r.organization_id)));
CREATE POLICY rubric_levels_write ON public.rubric_levels
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rubric_criteria c JOIN public.rubrics r ON r.id = c.rubric_id
    WHERE c.id = criterion_id AND app_private.can_grade_in_org(r.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rubric_criteria c JOIN public.rubrics r ON r.id = c.rubric_id
    WHERE c.id = criterion_id AND app_private.can_grade_in_org(r.organization_id)));

-- ------------------------------------------------------------
-- submissions
-- ------------------------------------------------------------
CREATE TABLE public.assessment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL REFERENCES public.assessment_definitions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'in_progress',
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  last_saved_at timestamptz NOT NULL DEFAULT now(),
  time_spent_seconds integer NOT NULL DEFAULT 0,
  autosave jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric,
  percentage numeric,
  grade_label text,
  is_late boolean NOT NULL DEFAULT false,
  feedback text,
  graded_by uuid REFERENCES public.profiles(id),
  graded_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_id, attempt_number),
  CONSTRAINT assessment_submissions_status_check CHECK (status IN
    ('in_progress','submitted','grading','graded','reviewed','returned'))
);
CREATE INDEX assessment_submissions_assessment_idx ON public.assessment_submissions (assessment_id, status);
CREATE INDEX assessment_submissions_student_idx ON public.assessment_submissions (student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_submissions TO authenticated;
GRANT ALL ON public.assessment_submissions TO service_role;
ALTER TABLE public.assessment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessment_submissions_select ON public.assessment_submissions
  FOR SELECT TO authenticated
  USING (app_private.can_grade_in_org(organization_id)
      OR app_private.is_self_student(student_id)
      OR app_private.can_view_student(student_id));
CREATE POLICY assessment_submissions_insert ON public.assessment_submissions
  FOR INSERT TO authenticated
  WITH CHECK (app_private.can_grade_in_org(organization_id) OR app_private.is_self_student(student_id));
CREATE POLICY assessment_submissions_update ON public.assessment_submissions
  FOR UPDATE TO authenticated
  USING (app_private.can_grade_in_org(organization_id)
      OR (app_private.is_self_student(student_id) AND status = 'in_progress'))
  WITH CHECK (app_private.can_grade_in_org(organization_id) OR app_private.is_self_student(student_id));

CREATE TRIGGER assessment_submissions_set_updated_at BEFORE UPDATE ON public.assessment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.submission_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assessment_submissions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.question_bank_items(id) ON DELETE CASCADE,
  answer jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  is_correct boolean,
  awarded_points numeric,
  feedback text,
  graded_by uuid REFERENCES public.profiles(id),
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_answers TO authenticated;
GRANT ALL ON public.submission_answers TO service_role;
ALTER TABLE public.submission_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY submission_answers_select ON public.submission_answers
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.assessment_submissions s WHERE s.id = submission_id
      AND (app_private.can_grade_in_org(s.organization_id) OR app_private.is_self_student(s.student_id)
           OR app_private.can_view_student(s.student_id))));
CREATE POLICY submission_answers_write ON public.submission_answers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessment_submissions s WHERE s.id = submission_id
    AND (app_private.can_grade_in_org(s.organization_id) OR app_private.is_self_student(s.student_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessment_submissions s WHERE s.id = submission_id
    AND (app_private.can_grade_in_org(s.organization_id) OR app_private.is_self_student(s.student_id))));
CREATE TRIGGER submission_answers_set_updated_at BEFORE UPDATE ON public.submission_answers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.submission_rubric_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.assessment_submissions(id) ON DELETE CASCADE,
  criterion_id uuid NOT NULL REFERENCES public.rubric_criteria(id) ON DELETE CASCADE,
  level_id uuid REFERENCES public.rubric_levels(id) ON DELETE SET NULL,
  points numeric NOT NULL DEFAULT 0,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, criterion_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submission_rubric_scores TO authenticated;
GRANT ALL ON public.submission_rubric_scores TO service_role;
ALTER TABLE public.submission_rubric_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY submission_rubric_scores_select ON public.submission_rubric_scores
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.assessment_submissions s WHERE s.id = submission_id
      AND (app_private.can_grade_in_org(s.organization_id) OR app_private.is_self_student(s.student_id)
           OR app_private.can_view_student(s.student_id))));
CREATE POLICY submission_rubric_scores_write ON public.submission_rubric_scores
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessment_submissions s WHERE s.id = submission_id
    AND app_private.can_grade_in_org(s.organization_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessment_submissions s WHERE s.id = submission_id
    AND app_private.can_grade_in_org(s.organization_id)));
CREATE TRIGGER submission_rubric_scores_set_updated_at BEFORE UPDATE ON public.submission_rubric_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
