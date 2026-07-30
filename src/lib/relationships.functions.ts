import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const relationshipKind = z.enum(["parent", "teacher", "tutor"]);

const inviteSchema = z.object({
  kind: relationshipKind,
  organizationId: z.string().uuid(),
  studentId: z.string().uuid(),
  inviteeUserId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
  roleSubtype: z
    .enum(["biological_parent", "legal_guardian", "foster_parent", "other_guardian"])
    .optional(),
  permissionLevel: z.enum(["full_management", "view_only"]).optional(),
  notes: z.string().trim().max(500).optional(),
});

const TABLE_BY_KIND = {
  parent: "parent_student_relationships",
  teacher: "teacher_student_relationships",
  tutor: "tutor_student_relationships",
} as const;

const ROLE_CODE_BY_KIND = {
  parent: "parent_guardian",
  teacher: "teacher",
  tutor: "tutor",
} as const;

/**
 * Multi-step: writes the pending relationship row and notifies the invitee.
 * Teachers and tutors can never invite themselves — RLS rejects it.
 */
export const inviteRelationship = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const base = {
      organization_id: data.organizationId,
      student_id: data.studentId,
      status: "pending_invitation" as const,
      invitation_status: "sent" as const,
      notes: data.notes ?? null,
      created_by: userId,
    };

    let insertError: string | null = null;

    if (data.kind === "parent") {
      const { error } = await supabase.from("parent_student_relationships").insert({
        ...base,
        parent_id: data.inviteeUserId,
        role_subtype: data.roleSubtype ?? "other_guardian",
        permission_level: data.permissionLevel ?? "view_only",
      });
      insertError = error?.message ?? null;
    } else if (data.kind === "teacher") {
      const { error } = await supabase.from("teacher_student_relationships").insert({
        ...base,
        teacher_id: data.inviteeUserId,
        subject_id: data.subjectId ?? null,
      });
      insertError = error?.message ?? null;
    } else {
      const { error } = await supabase.from("tutor_student_relationships").insert({
        ...base,
        tutor_id: data.inviteeUserId,
        subject_id: data.subjectId ?? null,
      });
      insertError = error?.message ?? null;
    }

    if (insertError) throw new Error(insertError);

    const { data: inviteeRole } = await supabase
      .from("user_roles")
      .select("id, role:roles!inner(code)")
      .eq("user_id", data.inviteeUserId)
      .eq("organization_id", data.organizationId)
      .eq("status", "active")
      .eq("roles.code", ROLE_CODE_BY_KIND[data.kind])
      .maybeSingle();

    if (inviteeRole?.id) {
      await supabase.from("notifications").insert({
        recipient_user_role_id: inviteeRole.id,
        type: "relationship_invitation",
        payload: { kind: data.kind, student_id: data.studentId },
      });
    }

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: data.organizationId,
      action: "relationship.invited",
      entity_type: TABLE_BY_KIND[data.kind],
      entity_id: data.studentId,
      after_state: { invitee: data.inviteeUserId, kind: data.kind },
    });

    return { ok: true };
  });

const respondSchema = z.object({
  kind: relationshipKind,
  relationshipId: z.string().uuid(),
  accept: z.boolean(),
});

export const respondToInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => respondSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch = data.accept
      ? { status: "active" as const, invitation_status: "accepted" as const }
      : { status: "declined" as const, invitation_status: "declined" as const };

    const { error } = await supabase
      .from(TABLE_BY_KIND[data.kind])
      .update(patch)
      .eq("id", data.relationshipId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      action: data.accept ? "relationship.accepted" : "relationship.declined",
      entity_type: TABLE_BY_KIND[data.kind],
      entity_id: data.relationshipId,
    });

    return { ok: true };
  });

const setStatusSchema = z.object({
  kind: relationshipKind,
  relationshipId: z.string().uuid(),
  status: z.enum(["active", "suspended", "ended"]),
});

export const setRelationshipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from(TABLE_BY_KIND[data.kind])
      .update({ status: data.status })
      .eq("id", data.relationshipId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
