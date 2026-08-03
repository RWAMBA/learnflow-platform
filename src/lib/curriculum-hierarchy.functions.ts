import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeCurriculumAudit } from "@/lib/curriculum-audit";

const uuid = z.string().uuid();
const status = z.enum(["draft", "review", "published", "archived"]);

const strandInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  subjectId: uuid,
  curriculumVersionId: uuid.nullable().optional(),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  sequenceOrder: z.number().int().min(1).max(999),
  status,
});

const subStrandInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  strandId: uuid,
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  sequenceOrder: z.number().int().min(1).max(999),
  status,
});

const outcomeInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  subStrandId: uuid,
  competencyId: uuid.nullable().optional(),
  description: z.string().trim().min(3).max(1000),
  sequenceOrder: z.number().int().min(1).max(999),
  status,
});

const resourceInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  entityType: z.enum(["subject", "strand", "sub_strand", "topic", "lesson"]),
  entityId: uuid,
  resourceType: z.enum(["pdf", "video", "image", "audio", "link", "document"]),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  url: z.string().trim().url().max(2000).nullable().optional(),
  storagePath: z.string().trim().max(500).nullable().optional(),
});

const versionInput = z.object({
  id: uuid.optional(),
  organizationId: uuid,
  curriculumId: uuid,
  label: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(2000).nullable().optional(),
  status,
});

const publishedAt = (value: string) => (value === "published" ? new Date().toISOString() : null);

export const saveStrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => strandInput.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      subject_id: data.subjectId,
      curriculum_version_id: data.curriculumVersionId || null,
      title: data.title,
      description: data.description || null,
      sequence_order: data.sequenceOrder,
      status: data.status,
      authoring_organization_id: data.organizationId,
      published_at: publishedAt(data.status),
    };
    const query = data.id
      ? context.supabase.from("strands").update(row).eq("id", data.id).select("id").single()
      : context.supabase.from("strands").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: data.id ? "curriculum.strand.updated" : "curriculum.strand.created",
      entityType: "strands",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

export const saveSubStrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => subStrandInput.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      strand_id: data.strandId,
      title: data.title,
      description: data.description || null,
      sequence_order: data.sequenceOrder,
      status: data.status,
      authoring_organization_id: data.organizationId,
      published_at: publishedAt(data.status),
    };
    const query = data.id
      ? context.supabase.from("sub_strands").update(row).eq("id", data.id).select("id").single()
      : context.supabase.from("sub_strands").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: data.id ? "curriculum.sub_strand.updated" : "curriculum.sub_strand.created",
      entityType: "sub_strands",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

export const saveLearningOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => outcomeInput.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      sub_strand_id: data.subStrandId,
      competency_id: data.competencyId || null,
      description: data.description,
      sequence_order: data.sequenceOrder,
      status: data.status,
      authoring_organization_id: data.organizationId,
    };
    const query = data.id
      ? context.supabase
          .from("learning_outcomes")
          .update(row)
          .eq("id", data.id)
          .select("id")
          .single()
      : context.supabase.from("learning_outcomes").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: data.id ? "curriculum.outcome.updated" : "curriculum.outcome.created",
      entityType: "learning_outcomes",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

/** Status transitions for the extended hierarchy (draft → review → published → archived). */
export const setHierarchyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entity: z.enum(["strands", "sub_strands", "learning_outcomes"]),
        id: uuid,
        organizationId: uuid,
        status,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status: data.status };
    if (data.entity !== "learning_outcomes") patch['published_at'] = publishedAt(data.status);
    const { error } = await context.supabase.from(data.entity).update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: `curriculum.${data.entity}.status_changed`,
      entityType: data.entity,
      entityId: data.id,
      afterState: { status: data.status },
    });
    return { ok: true };
  });

export const deleteHierarchyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        entity: z.enum(["strands", "sub_strands", "learning_outcomes", "curriculum_resources"]),
        id: uuid,
        organizationId: uuid,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from(data.entity).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: `curriculum.${data.entity}.deleted`,
      entityType: data.entity,
      entityId: data.id,
    });
    return { ok: true };
  });

/* -------------------------------------------------------- resources */

export const saveCurriculumResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resourceInput.parse(input))
  .handler(async ({ data, context }) => {
    if (!data.url && !data.storagePath) {
      throw new Error("Provide either a link or an uploaded file.");
    }
    const row = {
      organization_id: data.organizationId,
      entity_type: data.entityType,
      entity_id: data.entityId,
      resource_type: data.resourceType,
      title: data.title,
      description: data.description || null,
      url: data.url || null,
      storage_path: data.storagePath || null,
      created_by: context.userId,
    };
    const query = data.id
      ? context.supabase
          .from("curriculum_resources")
          .update(row)
          .eq("id", data.id)
          .select("id")
          .single()
      : context.supabase.from("curriculum_resources").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: data.id ? "curriculum.resource.updated" : "curriculum.resource.created",
      entityType: "curriculum_resources",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

/* --------------------------------------------------------- lessons */

export const updateLessonDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: uuid,
        lessonId: uuid,
        summary: z.string().trim().max(2000).nullable().optional(),
        estimatedMinutes: z.number().int().min(1).max(1000).nullable().optional(),
        subStrandId: uuid.nullable().optional(),
        learningOutcomeId: uuid.nullable().optional(),
        prerequisiteLessonIds: z.array(uuid).max(20).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("lessons")
      .update({
        summary: data.summary || null,
        estimated_minutes: data.estimatedMinutes ?? null,
        sub_strand_id: data.subStrandId || null,
        learning_outcome_id: data.learningOutcomeId || null,
      })
      .eq("id", data.lessonId);
    if (error) throw new Error(error.message);

    if (data.prerequisiteLessonIds) {
      const { error: clearError } = await supabase
        .from("lesson_prerequisites")
        .delete()
        .eq("lesson_id", data.lessonId);
      if (clearError) throw new Error(clearError.message);
      const rows = data.prerequisiteLessonIds
        .filter((id) => id !== data.lessonId)
        .map((id) => ({ lesson_id: data.lessonId, prerequisite_lesson_id: id }));
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from("lesson_prerequisites").insert(rows);
        if (insertError) throw new Error(insertError.message);
      }
    }

    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.lesson.details_updated",
      entityType: "lessons",
      entityId: data.lessonId,
      afterState: { estimated_minutes: data.estimatedMinutes ?? null },
    });
    return { ok: true };
  });

/** Reorder lessons inside a subject (drag-free ordering used by planning views). */
export const reorderLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: uuid,
        subjectId: uuid,
        orderedLessonIds: z.array(uuid).min(1).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    for (const [index, lessonId] of data.orderedLessonIds.entries()) {
      const { error } = await context.supabase
        .from("lessons")
        .update({ sequence_order: index + 1 })
        .eq("id", lessonId);
      if (error) throw new Error(error.message);
    }
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.lessons.reordered",
      entityType: "subjects",
      entityId: data.subjectId,
      afterState: { order: data.orderedLessonIds },
    });
    return { ok: true };
  });

/* --------------------------------------------------------- versions */

export const saveCurriculumVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => versionInput.parse(input))
  .handler(async ({ data, context }) => {
    const row = {
      curriculum_id: data.curriculumId,
      organization_id: data.organizationId,
      label: data.label,
      notes: data.notes || null,
      status: data.status,
      published_at: publishedAt(data.status),
      created_by: context.userId,
    };
    const query = data.id
      ? context.supabase
          .from("curriculum_versions")
          .update(row)
          .eq("id", data.id)
          .select("id")
          .single()
      : context.supabase.from("curriculum_versions").insert(row).select("id").single();
    const { data: saved, error } = await query;
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: data.id ? "curriculum.version.updated" : "curriculum.version.created",
      entityType: "curriculum_versions",
      entityId: saved.id,
      afterState: row,
    });
    return { id: saved.id };
  });

/**
 * Clones a version into a new draft. Published curriculum is never
 * overwritten — the clone keeps a pointer back to its parent version.
 */
export const cloneCurriculumVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ organizationId: uuid, versionId: uuid, label: z.string().trim().min(1).max(60) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: source, error: sourceError } = await supabase
      .from("curriculum_versions")
      .select("id, curriculum_id, notes")
      .eq("id", data.versionId)
      .single();
    if (sourceError) throw new Error(sourceError.message);

    const { data: created, error } = await supabase
      .from("curriculum_versions")
      .insert({
        curriculum_id: source.curriculum_id,
        organization_id: data.organizationId,
        parent_version_id: source.id,
        label: data.label,
        notes: source.notes,
        status: "draft",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: strands, error: strandError } = await supabase
      .from("strands")
      .select("subject_id, title, description, sequence_order, authoring_organization_id")
      .eq("curriculum_version_id", data.versionId);
    if (strandError) throw new Error(strandError.message);

    if ((strands ?? []).length > 0) {
      const { error: copyError } = await supabase.from("strands").insert(
        (strands ?? []).map((strand) => ({
          subject_id: strand.subject_id,
          title: strand.title,
          description: strand.description,
          sequence_order: strand.sequence_order,
          status: "draft",
          authoring_organization_id: data.organizationId,
          curriculum_version_id: created.id,
        })),
      );
      if (copyError) throw new Error(copyError.message);
    }

    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.version.cloned",
      entityType: "curriculum_versions",
      entityId: created.id,
      afterState: { parent_version_id: source.id },
    });
    return { id: created.id };
  });

/** Publish / archive / restore a version. Restoring returns it to draft. */
export const setCurriculumVersionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ organizationId: uuid, versionId: uuid, status }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("curriculum_versions")
      .update({ status: data.status, published_at: publishedAt(data.status) })
      .eq("id", data.versionId);
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.version.status_changed",
      entityType: "curriculum_versions",
      entityId: data.versionId,
      afterState: { status: data.status },
    });
    return { ok: true };
  });

/* ------------------------------------------------------- bulk admin */

/** Bulk publish / archive across many curriculum items at once. */
export const bulkSetCurriculumStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: uuid,
        entity: z.enum(["subjects", "topics", "lessons", "strands", "sub_strands"]),
        ids: z.array(uuid).min(1).max(500),
        status,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from(data.entity)
      .update({ status: data.status, published_at: publishedAt(data.status) })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: `curriculum.${data.entity}.bulk_status_changed`,
      entityType: data.entity,
      entityId: data.ids[0]!,
      afterState: { ids: data.ids, status: data.status },
    });
    return { updated: data.ids.length };
  });

/** Duplicates a subject with its topics and lessons as a reusable draft copy. */
export const duplicateSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        organizationId: uuid,
        subjectId: uuid,
        name: z.string().trim().min(2).max(120),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: source, error: sourceError } = await supabase
      .from("subjects")
      .select("id, grade_id, pathway_id, code, description")
      .eq("id", data.subjectId)
      .single();
    if (sourceError) throw new Error(sourceError.message);

    const { data: subject, error } = await supabase
      .from("subjects")
      .insert({
        grade_id: source.grade_id,
        pathway_id: source.pathway_id,
        name: data.name,
        code: source.code,
        description: source.description,
        status: "draft",
        authoring_organization_id: data.organizationId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const [{ data: topics }, { data: lessons }] = await Promise.all([
      supabase
        .from("topics")
        .select("id, title, description, sequence_order")
        .eq("subject_id", data.subjectId),
      supabase
        .from("lessons")
        .select("title, sequence_order, content_type, content_body, summary, estimated_minutes, topic_id")
        .eq("subject_id", data.subjectId),
    ]);

    const topicIdMap = new Map<string, string>();
    for (const topic of topics ?? []) {
      const { data: copied, error: topicError } = await supabase
        .from("topics")
        .insert({
          subject_id: subject.id,
          title: topic.title,
          description: topic.description,
          sequence_order: topic.sequence_order,
          status: "draft",
          authoring_organization_id: data.organizationId,
        })
        .select("id")
        .single();
      if (topicError) throw new Error(topicError.message);
      topicIdMap.set(topic.id, copied.id);
    }

    if ((lessons ?? []).length > 0) {
      const { error: lessonError } = await supabase.from("lessons").insert(
        (lessons ?? []).map((lesson) => ({
          subject_id: subject.id,
          topic_id: lesson.topic_id ? (topicIdMap.get(lesson.topic_id) ?? null) : null,
          title: lesson.title,
          sequence_order: lesson.sequence_order,
          content_type: lesson.content_type,
          content_body: lesson.content_body,
          summary: lesson.summary,
          estimated_minutes: lesson.estimated_minutes,
          status: "draft",
          author_type: "tenant",
          authoring_organization_id: data.organizationId,
        })),
      );
      if (lessonError) throw new Error(lessonError.message);
    }

    await writeCurriculumAudit(context, {
      organizationId: data.organizationId,
      action: "curriculum.subject.duplicated",
      entityType: "subjects",
      entityId: subject.id,
      afterState: { source_subject_id: data.subjectId },
    });
    return { id: subject.id };
  });
