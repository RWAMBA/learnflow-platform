import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assessmentInputSchema,
  questionInputSchema,
  rubricInputSchema,
} from "@/features/assessments/schemas";
import { ASSESSMENT_STATUSES } from "@/features/assessments/constants";
import { writeCurriculumAudit } from "@/lib/curriculum-audit";
import {
  assessmentRow,
  cloneAssessment,
  notifyAssessmentAudience,
  questionRow,
  replaceCurriculumLinks,
  writeRubric,
} from "@/lib/assessment-authoring.server";

/** Create or update an assessment along with its curriculum links. */
export const saveAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => assessmentInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = assessmentRow(data, userId);

    let assessmentId = data.assessmentId ?? null;
    if (assessmentId) {
      const { created_by: _createdBy, ...updates } = row;
      const { error } = await supabase
        .from("assessment_definitions")
        .update(updates)
        .eq("id", assessmentId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("assessment_definitions")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      assessmentId = created.id;
    }

    await replaceCurriculumLinks(
      supabase,
      assessmentId!,
      data.competencyIds,
      data.learningOutcomeIds,
    );
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: data.assessmentId ? "assessment.updated" : "assessment.created",
      entityType: "assessment_definitions",
      entityId: assessmentId!,
      afterState: { title: data.title, status: data.status },
    });

    return { assessmentId: assessmentId! };
  });

const statusSchema = z.object({
  assessmentIds: z.array(z.string().uuid()).min(1),
  status: z.enum(ASSESSMENT_STATUSES),
});

/** Lifecycle transitions, including bulk publishing. */
export const setAssessmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const publishing = data.status === "published" || data.status === "open";

    const { data: rows, error } = await supabase
      .from("assessment_definitions")
      .update({
        status: data.status,
        ...(publishing ? { published_at: new Date().toISOString() } : {}),
      })
      .in("id", data.assessmentIds)
      .select("id, title, organization_id, grade_id, due_at, parent_visible");
    if (error) throw new Error(error.message);

    if (publishing) {
      for (const row of rows ?? []) {
        await notifyAssessmentAudience(supabase, {
          organizationId: row.organization_id,
          gradeId: row.grade_id,
          assessmentId: row.id,
          type: "assessment_published",
          payload: { title: row.title, due_at: row.due_at },
        });
      }
    }

    for (const row of rows ?? []) {
      await writeCurriculumAudit(context, {
        organizationId: row.organization_id,
        action: `assessment.${data.status}`,
        entityType: "assessment_definitions",
        entityId: row.id,
        afterState: { status: data.status },
      });
    }

    return { updated: (rows ?? []).length };
  });

const duplicateSchema = z.object({
  assessmentId: z.string().uuid(),
  title: z.string().trim().max(200).nullable().default(null),
  asTemplate: z.boolean().default(false),
});

/** Duplicate an assessment (also used to save one as a reusable template). */
export const duplicateAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => duplicateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const newId = await cloneAssessment(
      context.supabase,
      data.assessmentId,
      data.title,
      context.userId,
      data.asTemplate,
    );
    return { assessmentId: newId };
  });

const questionsSchema = z.object({
  assessmentId: z.string().uuid(),
  questions: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        sequenceOrder: z.number().int().min(0),
        pointsOverride: z.number().min(0).max(1000).nullable().default(null),
        required: z.boolean().default(true),
      }),
    )
    .default([]),
});

/** Replace the ordered question set of an assessment. */
export const setAssessmentQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => questionsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error: deleteError } = await supabase
      .from("assessment_questions")
      .delete()
      .eq("assessment_id", data.assessmentId);
    if (deleteError) throw new Error(deleteError.message);

    if (data.questions.length > 0) {
      const { error } = await supabase.from("assessment_questions").insert(
        data.questions.map((question) => ({
          assessment_id: data.assessmentId,
          question_id: question.questionId,
          sequence_order: question.sequenceOrder,
          points_override: question.pointsOverride,
          required: question.required,
        })),
      );
      if (error) throw new Error(error.message);
    }
    return { count: data.questions.length };
  });

/** Create a question, or update it — optionally as a new version. */
export const saveQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => questionInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = questionRow(data, userId);

    if (data.questionId && !data.createVersion) {
      const { created_by: _createdBy, ...updates } = row;
      const { error } = await supabase
        .from("question_bank_items")
        .update(updates)
        .eq("id", data.questionId);
      if (error) throw new Error(error.message);
      return { questionId: data.questionId };
    }

    let version = 1;
    if (data.questionId) {
      const { data: parent } = await supabase
        .from("question_bank_items")
        .select("version")
        .eq("id", data.questionId)
        .maybeSingle();
      version = (parent?.version ?? 1) + 1;
      await supabase
        .from("question_bank_items")
        .update({ status: "archived" })
        .eq("id", data.questionId);
    }

    const { data: created, error } = await supabase
      .from("question_bank_items")
      .insert({ ...row, version, parent_question_id: data.questionId ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { questionId: created.id };
  });

const questionIdsSchema = z.object({ questionIds: z.array(z.string().uuid()).min(1) });

/** Bulk archive questions (soft delete keeps historical submissions intact). */
export const archiveQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => questionIdsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("question_bank_items")
      .update({ status: "archived" })
      .in("id", data.questionIds);
    if (error) throw new Error(error.message);
    return { archived: data.questionIds.length };
  });

const importSchema = z.object({
  organizationId: z.string().uuid(),
  items: z
    .array(
      questionInputSchema.omit({ organizationId: true, questionId: true, createVersion: true }),
    )
    .min(1),
});

/** Import a batch of questions (JSON export/import for the question bank). */
export const importQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => importSchema.parse(input))
  .handler(async ({ data, context }) => {
    const rows = data.items.map((item) =>
      questionRow(
        { ...item, organizationId: data.organizationId, createVersion: false },
        context.userId,
      ),
    );
    const { data: created, error } = await context.supabase
      .from("question_bank_items")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);
    return { imported: (created ?? []).length };
  });

/** Create or replace a rubric with its criteria and levels. */
export const saveRubric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rubricInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const rubricId = await writeRubric(context.supabase, data, context.userId);
    return { rubricId };
  });

const typeSchema = z.object({
  organizationId: z.string().uuid(),
  code: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores")
    .max(60),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().default(null),
  category: z.string().trim().max(60).default("formative"),
});

/** Teacher-defined assessment categories. */
export const createAssessmentType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => typeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("assessment_types")
      .insert({
        organization_id: data.organizationId,
        code: data.code,
        name: data.name,
        description: data.description,
        category: data.category,
        is_system: false,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { assessmentTypeId: created.id };
  });
