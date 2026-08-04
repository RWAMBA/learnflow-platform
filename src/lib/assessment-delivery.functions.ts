import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { gradeSubmissionSchema } from "@/features/assessments/schemas";
import {
  materialiseAnswers,
  notifyAssessmentAuthor,
  notifyStudentAudience,
  recomputeSubmissionScore,
  recordCompetencyMastery,
} from "@/lib/assessment-delivery.server";

const startSchema = z.object({
  assessmentId: z.string().uuid(),
  studentId: z.string().uuid(),
});

/** Start a new attempt, or resume the learner's unfinished one. */
export const startAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: assessment, error } = await supabase
      .from("assessment_definitions")
      .select("id, organization_id, status, attempts_allowed, due_at, late_submission_allowed, available_until")
      .eq("id", data.assessmentId)
      .single();
    if (error) throw new Error(error.message);
    if (!["published", "open", "in_progress"].includes(assessment.status)) {
      throw new Error("This assessment is not open yet");
    }

    const { data: existing } = await supabase
      .from("assessment_submissions")
      .select("id, status, attempt_number")
      .eq("assessment_id", data.assessmentId)
      .eq("student_id", data.studentId)
      .order("attempt_number", { ascending: false });

    const resumable = (existing ?? []).find((row) => row.status === "in_progress");
    if (resumable) return { submissionId: resumable.id, resumed: true };

    const used = (existing ?? []).length;
    if (used >= assessment.attempts_allowed) throw new Error("No attempts remaining");

    const { data: created, error: insertError } = await supabase
      .from("assessment_submissions")
      .insert({
        organization_id: assessment.organization_id,
        assessment_id: data.assessmentId,
        student_id: data.studentId,
        attempt_number: used + 1,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    return { submissionId: created.id, resumed: false };
  });

const autosaveSchema = z.object({
  submissionId: z.string().uuid(),
  autosave: z.record(z.string(), z.unknown()),
  timeSpentSeconds: z.number().int().min(0).max(86400).default(0),
});

/** Persist draft answers so a refresh or dropped connection loses nothing. */
export const autosaveAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => autosaveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("assessment_submissions")
      .update({
        autosave: data.autosave as never,
        time_spent_seconds: data.timeSpentSeconds,
        last_saved_at: new Date().toISOString(),
      })
      .eq("id", data.submissionId)
      .eq("status", "in_progress");
    if (error) throw new Error(error.message);
    return { savedAt: new Date().toISOString() };
  });

const submitSchema = z.object({
  submissionId: z.string().uuid(),
  autosave: z.record(z.string(), z.unknown()).default({}),
  timeSpentSeconds: z.number().int().min(0).max(86400).default(0),
});

/** Hand in an attempt: score the objective questions and alert the teacher. */
export const submitAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => submitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: submission, error } = await supabase
      .from("assessment_submissions")
      .select(
        "id, assessment_id, student_id, organization_id, autosave, assessment:assessment_definitions(id, max_score, due_at, auto_grade, late_submission_allowed, late_penalty_percent)",
      )
      .eq("id", data.submissionId)
      .single();
    if (error) throw new Error(error.message);

    const merged = {
      ...((submission.autosave ?? {}) as Record<string, unknown>),
      ...data.autosave,
    };
    const scored = await materialiseAnswers(
      supabase,
      submission.id,
      submission.assessment_id,
      merged,
    );

    const dueAt = submission.assessment?.due_at ? new Date(submission.assessment.due_at) : null;
    const isLate = Boolean(dueAt && dueAt.getTime() < Date.now());
    const penalty = isLate ? Number(submission.assessment?.late_penalty_percent ?? 0) : 0;
    const maxScore = Number(submission.assessment?.max_score ?? scored.possible ?? 100);
    const rawPercentage = Math.max(0, scored.percentage - penalty);
    const autoComplete = submission.assessment?.auto_grade && !scored.needsManualGrading;

    const { error: updateError } = await supabase
      .from("assessment_submissions")
      .update({
        status: autoComplete ? "graded" : "submitted",
        submitted_at: new Date().toISOString(),
        autosave: merged as never,
        time_spent_seconds: data.timeSpentSeconds,
        is_late: isLate,
        score: autoComplete ? Math.round((rawPercentage / 100) * maxScore * 10) / 10 : null,
        percentage: autoComplete ? rawPercentage : null,
        grade_label: autoComplete ? scored.gradeLabel : null,
        graded_at: autoComplete ? new Date().toISOString() : null,
      })
      .eq("id", data.submissionId);
    if (updateError) throw new Error(updateError.message);

    await notifyAssessmentAuthor(supabase, {
      organizationId: submission.organization_id,
      assessmentId: submission.assessment_id,
      type: "assessment_submitted",
      payload: { submission_id: submission.id, student_id: submission.student_id },
    });

    if (autoComplete) {
      await notifyStudentAudience(supabase, {
        organizationId: submission.organization_id,
        studentId: submission.student_id,
        type: "assessment_graded",
        payload: { submission_id: submission.id, percentage: rawPercentage },
      });
      const { data: links } = await supabase
        .from("assessment_competencies")
        .select("competency_id")
        .eq("assessment_id", submission.assessment_id);
      await recordCompetencyMastery(supabase, {
        studentId: submission.student_id,
        competencyIds: (links ?? []).map((row: { competency_id: string }) => row.competency_id),
        percentage: rawPercentage,
        lessonId: null,
        recordedBy: userId,
        notes: "Auto-graded assessment",
      });
    }

    return {
      submissionId: submission.id,
      autoGraded: Boolean(autoComplete),
      percentage: autoComplete ? rawPercentage : null,
    };
  });

/** Teacher marking: per-question marks, rubric scores, feedback and mastery. */
export const gradeSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => gradeSubmissionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: submission, error } = await supabase
      .from("assessment_submissions")
      .select(
        "id, assessment_id, student_id, organization_id, assessment:assessment_definitions(id, max_score, lesson_id)",
      )
      .eq("id", data.submissionId)
      .single();
    if (error) throw new Error(error.message);

    for (const answer of data.answers) {
      const { error: answerError } = await supabase
        .from("submission_answers")
        .update({
          awarded_points: answer.awardedPoints,
          feedback: answer.feedback ?? null,
          graded_by: userId,
          graded_at: new Date().toISOString(),
        })
        .eq("submission_id", data.submissionId)
        .eq("question_id", answer.questionId);
      if (answerError) throw new Error(answerError.message);
    }

    if (data.rubricScores.length > 0) {
      const { error: rubricError } = await supabase.from("submission_rubric_scores").upsert(
        data.rubricScores.map((row) => ({
          submission_id: data.submissionId,
          criterion_id: row.criterionId,
          level_id: row.levelId ?? null,
          points: row.points,
          comment: row.comment ?? null,
        })),
        { onConflict: "submission_id,criterion_id" },
      );
      if (rubricError) throw new Error(rubricError.message);
    }

    const maxScore = Number(submission.assessment?.max_score ?? 100);
    const totals = await recomputeSubmissionScore(supabase, data.submissionId, maxScore);

    const { error: updateError } = await supabase
      .from("assessment_submissions")
      .update({
        status: data.status,
        score: totals.score,
        percentage: totals.percentage,
        grade_label: totals.gradeLabel,
        feedback: data.feedback ?? null,
        graded_by: userId,
        graded_at: new Date().toISOString(),
        reviewed_at: data.status === "reviewed" ? new Date().toISOString() : null,
      })
      .eq("id", data.submissionId);
    if (updateError) throw new Error(updateError.message);

    await recordCompetencyMastery(supabase, {
      studentId: submission.student_id,
      competencyIds: data.competencyIds,
      percentage: totals.percentage,
      lessonId: submission.assessment?.lesson_id ?? null,
      recordedBy: userId,
      notes: data.feedback ?? null,
    });

    await notifyStudentAudience(supabase, {
      organizationId: submission.organization_id,
      studentId: submission.student_id,
      type: "assessment_graded",
      payload: {
        submission_id: submission.id,
        assessment_id: submission.assessment_id,
        percentage: totals.percentage,
      },
    });

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: submission.organization_id,
      action: "assessment.graded",
      entity_type: "assessment_submissions",
      entity_id: submission.id,
      after_state: { score: totals.score, percentage: totals.percentage, status: data.status },
    });

    return totals;
  });