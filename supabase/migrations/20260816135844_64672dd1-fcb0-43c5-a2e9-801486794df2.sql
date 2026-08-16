BEGIN;

-- ---------------------------------------------------------------------------
-- Phase 10 Stage 1A reference mappings (deterministic, additive DML only)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_providers bigint;
  v_stages    bigint;
  v_groups    bigint;
  v_versions  bigint;
  v_cbc       bigint;
BEGIN
  SELECT count(*) INTO v_providers FROM public.curriculum_providers;
  SELECT count(*) INTO v_stages    FROM public.education_stages;
  SELECT count(*) INTO v_groups    FROM public.subject_groups;
  SELECT count(*) INTO v_versions  FROM public.curriculum_versions;
  SELECT count(*) INTO v_cbc       FROM public.curricula WHERE code = 'CBC';

  IF v_providers <> 0 OR v_stages <> 0 OR v_groups <> 0 OR v_versions <> 0 THEN
    RAISE EXCEPTION 'Precondition failed: reference tables are not empty (providers=%, stages=%, groups=%, versions=%)',
      v_providers, v_stages, v_groups, v_versions;
  END IF;

  IF v_cbc <> 1 THEN
    RAISE EXCEPTION 'Precondition failed: expected exactly one CBC curriculum row, found %', v_cbc;
  END IF;
END
$$;

-- A. Curriculum providers (Phase 10B Section 4, approved reference definitions)
INSERT INTO public.curriculum_providers (code, name) VALUES
  ('KICD',      'Kenya Institute of Curriculum Development'),
  ('CAIE',      'Cambridge Assessment International Education'),
  ('PEARSON',   'Pearson Edexcel'),
  ('LEARNFLOW', 'LearnFlow');

-- B. Provider attribution for the existing curriculum
UPDATE public.curricula c
   SET provider_id = p.id
  FROM public.curriculum_providers p
 WHERE c.code = 'CBC' AND p.code = 'KICD';

-- C. Baseline curriculum version for CBC (platform-owned, current)
INSERT INTO public.curriculum_versions
  (curriculum_id, organization_id, label, notes, status, published_at, is_current)
SELECT c.id, NULL, 'Baseline',
       'Initial platform baseline version representing curriculum content that existed before Phase 10 versioning.',
       'published', now(), true
  FROM public.curricula c
 WHERE c.code = 'CBC';

-- D. CBC education stages (Phase 10B Section 4)
INSERT INTO public.education_stages
  (curriculum_version_id, name, sequence_order, status, published_at)
SELECT v.id, s.name, s.sequence_order, 'published', now()
  FROM public.curriculum_versions v
  JOIN public.curricula c ON c.id = v.curriculum_id AND c.code = 'CBC'
  CROSS JOIN (VALUES
    ('Pre-Primary', 1),
    ('Primary', 2),
    ('Junior Secondary', 3),
    ('Senior Secondary', 4)
  ) AS s(name, sequence_order)
 WHERE v.is_current;

-- E. Academic level -> education stage mapping (CBC: Grades 7-9 Junior, Grade 10 Senior)
UPDATE public.grades g
   SET education_stage_id = es.id
  FROM public.education_stages es
  JOIN public.curriculum_versions v ON v.id = es.curriculum_version_id AND v.is_current
  JOIN public.curricula c ON c.id = v.curriculum_id AND c.code = 'CBC'
 WHERE g.curriculum_id = c.id
   AND es.name = CASE
        WHEN g.sequence_order BETWEEN 7 AND 9  THEN 'Junior Secondary'
        WHEN g.sequence_order BETWEEN 10 AND 12 THEN 'Senior Secondary'
        WHEN g.sequence_order BETWEEN 1 AND 6  THEN 'Primary'
        ELSE NULL
      END;

-- F. Subject groups derived only from identical existing subject names
INSERT INTO public.subject_groups (name)
SELECT DISTINCT s.name FROM public.subjects s;

UPDATE public.subjects s
   SET subject_group_id = sg.id
  FROM public.subject_groups sg
 WHERE sg.name = s.name;

-- G. Post-conditions
DO $$
DECLARE
  v_unmapped_curricula bigint;
  v_unmapped_grades    bigint;
  v_unmapped_subjects  bigint;
  v_current            bigint;
  v_stages             bigint;
BEGIN
  SELECT count(*) INTO v_unmapped_curricula FROM public.curricula WHERE provider_id IS NULL;
  SELECT count(*) INTO v_unmapped_grades    FROM public.grades   WHERE education_stage_id IS NULL;
  SELECT count(*) INTO v_unmapped_subjects  FROM public.subjects WHERE subject_group_id IS NULL;
  SELECT count(*) INTO v_current            FROM public.curriculum_versions WHERE is_current;
  SELECT count(*) INTO v_stages             FROM public.education_stages;

  IF v_unmapped_curricula <> 0 THEN
    RAISE EXCEPTION 'Post-condition failed: % curricula without a provider', v_unmapped_curricula;
  END IF;
  IF v_unmapped_grades <> 0 THEN
    RAISE EXCEPTION 'Post-condition failed: % academic levels without an education stage', v_unmapped_grades;
  END IF;
  IF v_unmapped_subjects <> 0 THEN
    RAISE EXCEPTION 'Post-condition failed: % subjects without a subject group', v_unmapped_subjects;
  END IF;
  IF v_current <> 1 THEN
    RAISE EXCEPTION 'Post-condition failed: expected exactly one current curriculum version, found %', v_current;
  END IF;
  IF v_stages <> 4 THEN
    RAISE EXCEPTION 'Post-condition failed: expected four education stages, found %', v_stages;
  END IF;
END
$$;

COMMIT;