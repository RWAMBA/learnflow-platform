import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const publishStatus = z.enum(["draft", "published", "archived"]);
const uuid = z.string().uuid();

const subjectInput = z.object({
  id: uuid.optional(),
  gradeId: uuid,
  pathwayId: uuid.nullable().optional(),
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: publishStatus,
});

const topicInput = z.object({
  id: uuid.optional(),
  subjectId: uuid,
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  sequenceOrder: z.number().int().min(1).max(999),
  status: publishStatus,
});

const lessonInput = z
  .object({
    id: uuid.optional(),
    organizationId: uuid.nullable().optional(),
    authorType: z.enum(["platform", "tenant"]),
    subjectId: uuid,
    topicId: uuid.nullable().optional(),
    title: z.string().trim().min(2).max(160),
    sequenceOrder: z.number().int().min(1).max(999),
    contentType: z.enum(["text", "video", "document", "link", "quiz"]),
    contentBody: z.string().trim().max(20000).nullable().optional(),
    status: publishStatus,
  })
  .refine((value) => value.authorType !== "tenant" || Boolean(value.organizationId), {
    message: "Tenant lessons require an organization.",
    path: ["organizationId"],
  })
  .refine((value) => value.authorType !== "platform" || !value.organizationId, {
    message: "Platform lessons cannot have a tenant organization.",
    path: ["organizationId"],
  });

const objectiveInput = z.object({
  id: uuid.optional(),
  lessonId: uuid,
  organizationId: uuid.nullable().optional(),
  competencyId: uuid.nullable().optional(),
  description: z.string().trim().min(3).max(500),
  sequenceOrder: z.number().int().min(1).max(999),
});

const pathwayInput = z.object({
  id: uuid.optional(),
  gradeId: uuid,
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  status: publishStatus,
});

const masteryLevel = z.enum(["not_started", "emerging", "developing", "proficient", "mastered"]);

type AuditContext = {
  supabase: {
    from: (table: string) => { insert: (values: unknown) => Promise<{ error: unknown }> };
  };
};

async function writeAudit(
  context: { supabase: unknown; userId: string },
  input: {
    organizationId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    afterState?: unknown;
  },
) {
  const supabase = context.supabase as AuditContext["supabase"];
  await supabase.from("audit_logs").insert({
    actor_user_id: context.userId,
    organization_id: input.organizationId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    after_state: input.afterState ?? null,
  });
}

export const saveSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => subjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const row = {
      grade_id: data.gradeId,
      pathway_id: data.pathwayId || null,
      name: data.name,
      code: data.code || null,
      description: data.description || null,
      status: data.status,
      authoring_organization_id: null,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };
    const query = data.id
      ? supabase.from("subjects").update(row).eq("id", data.id).select("id").single()
      : supabase.from("subjects").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: null,
      action: data.id ? "curriculum.subject.updated" : "curriculum.subject.created",
      entityType: "subjects",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

export const saveTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => topicInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const row = {
      subject_id: data.subjectId,
      title: data.title,
      description: data.description || null,
      sequence_order: data.sequenceOrder,
      status: data.status,
      authoring_organization_id: null,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };
    const query = data.id
      ? supabase.from("topics").update(row).eq("id", data.id).select("id").single()
      : supabase.from("topics").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: null,
      action: data.id ? "curriculum.topic.updated" : "curriculum.topic.created",
      entityType: "topics",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

export const saveLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => lessonInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const row = {
      subject_id: data.subjectId,
      topic_id: data.topicId || null,
      title: data.title,
      sequence_order: data.sequenceOrder,
      content_type: data.contentType,
      content_body: data.contentBody ? { body: data.contentBody } : null,
      status: data.status,
      author_type: data.authorType,
      authoring_organization_id: data.authorType === "tenant" ? data.organizationId! : null,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };
    const query = data.id
      ? supabase.from("lessons").update(row).eq("id", data.id).select("id").single()
      : supabase.from("lessons").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: data.authorType === "tenant" ? data.organizationId! : null,
      action: data.id ? "curriculum.lesson.updated" : "curriculum.lesson.created",
      entityType: "lessons",
      entityId: saved.id,
      afterState: { title: data.title, status: data.status },
    });
    return { id: saved.id };
  });

export const setCurriculumStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entity: z.enum(["subjects", "topics", "lessons", "pathways"]),
        id: uuid,
        organizationId: uuid.nullable().optional(),
        status: publishStatus,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from(data.entity)
      .update({
        status: data.status,
        published_at: data.status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: data.organizationId ?? null,
      action: `curriculum.${data.entity}.status_changed`,
      entityType: data.entity,
      entityId: data.id,
      afterState: { status: data.status },
    });
    return { ok: true };
  });

export const deleteCurriculumItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entity: z.enum(["subjects", "topics", "lessons", "learning_objectives", "pathways"]),
        id: uuid,
        organizationId: uuid.nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from(data.entity).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: data.organizationId ?? null,
      action: `curriculum.${data.entity}.deleted`,
      entityType: data.entity,
      entityId: data.id,
    });
    return { ok: true };
  });

export const saveLearningObjective = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => objectiveInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const row = {
      lesson_id: data.lessonId,
      competency_id: data.competencyId || null,
      description: data.description,
      sequence_order: data.sequenceOrder,
    };
    const query = data.id
      ? supabase.from("learning_objectives").update(row).eq("id", data.id).select("id").single()
      : supabase.from("learning_objectives").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: data.organizationId ?? null,
      action: data.id ? "curriculum.objective.updated" : "curriculum.objective.created",
      entityType: "learning_objectives",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

export const assignSubjectToStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: uuid,
        subjectId: uuid,
        studentIds: z.array(uuid).min(1).max(200),
        notes: z.string().trim().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows = data.studentIds.map((studentId) => ({
      organization_id: data.organizationId,
      student_id: studentId,
      subject_id: data.subjectId,
      status: "active",
      notes: data.notes || null,
      assigned_by: userId,
    }));
    const { error } = await supabase
      .from("student_curriculum_assignments")
      .upsert(rows, { onConflict: "student_id,subject_id" });
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.assigned_to_students",
      entityType: "student_curriculum_assignments",
      entityId: data.subjectId,
      afterState: { student_ids: data.studentIds },
    });
    return { assigned: rows.length };
  });

export const removeCurriculumAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid, organizationId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("student_curriculum_assignments")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.assignment.removed",
      entityType: "student_curriculum_assignments",
      entityId: data.id,
    });
    return { ok: true };
  });

/* -------------------------------------------------------------- pathways */

export const savePathway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pathwayInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const row = {
      grade_id: data.gradeId,
      name: data.name,
      description: data.description || null,
      status: data.status,
      authoring_organization_id: null,
      published_at: data.status === "published" ? new Date().toISOString() : null,
    };
    const query = data.id
      ? supabase.from("pathways").update(row).eq("id", data.id).select("id").single()
      : supabase.from("pathways").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: null,
      action: data.id ? "curriculum.pathway.updated" : "curriculum.pathway.created",
      entityType: "pathways",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

export const assignPathwayToStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: uuid,
        pathwayId: uuid,
        studentIds: z.array(uuid).min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // The Track lives on the authoritative curriculum enrollment. The
    // deprecated students.pathway_id column is never written.
    const enrollments = await supabase
      .from("curriculum_enrollments")
      .select("id, student_id, academic_level_id")
      .in("student_id", data.studentIds)
      .eq("enrollment_category", "primary")
      .eq("status", "pending");
    if (enrollments.error) throw new Error(enrollments.error.message);

    const rows = enrollments.data ?? [];
    if (rows.length !== data.studentIds.length) {
      throw new Error(
        "Every selected learner needs a pending primary curriculum enrollment before a pathway can be assigned",
      );
    }

    const pathway = await supabase
      .from("pathways")
      .select("id, grade_id")
      .eq("id", data.pathwayId)
      .maybeSingle();
    if (pathway.error) throw new Error(pathway.error.message);
    if (!pathway.data) throw new Error("That pathway no longer exists");
    if (rows.some((row) => row.academic_level_id !== pathway.data!.grade_id)) {
      throw new Error("That pathway does not belong to every selected learner's grade");
    }

    const { error } = await supabase
      .from("curriculum_enrollments")
      .update({ track_id: data.pathwayId })
      .in(
        "id",
        rows.map((row) => row.id),
      );
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.pathway.assigned",
      entityType: "curriculum_enrollments",
      entityId: data.pathwayId,
      afterState: { student_ids: data.studentIds },
    });
    return { assigned: data.studentIds.length };
  });

/* -------------------------------------------------------------- progress */

/**
 * Capture point for learner progress. Assessments will reuse this by passing
 * the assessment id alongside the lesson / objective being evidenced.
 */
export const recordProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: uuid,
        studentId: uuid,
        lessonId: uuid.nullable().optional(),
        learningObjectiveId: uuid.nullable().optional(),
        competencyId: uuid.nullable().optional(),
        assessmentId: uuid.nullable().optional(),
        masteryLevel,
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      student_id: data.studentId,
      lesson_id: data.lessonId || null,
      learning_objective_id: data.learningObjectiveId || null,
      competency_id: data.competencyId || null,
      assessment_id: data.assessmentId || null,
      mastery_level: data.masteryLevel,
      notes: data.notes || null,
      recorded_by: userId,
    };
    const { data: saved, error } = await supabase
      .from("progress_records")
      .insert(row)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await writeAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.progress.recorded",
      entityType: "progress_records",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });
