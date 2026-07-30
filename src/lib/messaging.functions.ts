import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const startConversationSchema = z.object({
  organizationId: z.string().uuid(),
  senderUserRoleId: z.string().uuid(),
  recipientUserRoleId: z.string().uuid(),
  body: z.string().trim().min(1, "Message cannot be empty").max(2000),
});

/**
 * Multi-step: creates the conversation, both participant rows, the first
 * message and the recipient notification. Who may participate is enforced by
 * the relationship-driven RLS policies.
 */
export const startConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => startConversationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({ organization_id: data.organizationId })
      .select("id")
      .single();
    if (conversationError) throw new Error(conversationError.message);

    const { error: participantsError } = await supabase.from("conversation_participants").insert([
      { conversation_id: conversation.id, user_role_id: data.senderUserRoleId },
      { conversation_id: conversation.id, user_role_id: data.recipientUserRoleId },
    ]);
    if (participantsError) throw new Error(participantsError.message);

    const { error: messageError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_user_role_id: data.senderUserRoleId,
      body: data.body,
    });
    if (messageError) throw new Error(messageError.message);

    await supabase.from("notifications").insert({
      recipient_user_role_id: data.recipientUserRoleId,
      type: "new_message",
      payload: { conversation_id: conversation.id },
    });

    return { conversationId: conversation.id };
  });

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  senderUserRoleId: z.string().uuid(),
  body: z.string().trim().min(1, "Message cannot be empty").max(2000),
});

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { error } = await supabase.from("messages").insert({
      conversation_id: data.conversationId,
      sender_user_role_id: data.senderUserRoleId,
      body: data.body,
    });
    if (error) throw new Error(error.message);

    const { data: participants } = await supabase
      .from("conversation_participants")
      .select("user_role_id")
      .eq("conversation_id", data.conversationId)
      .neq("user_role_id", data.senderUserRoleId);

    if (participants?.length) {
      await supabase.from("notifications").insert(
        participants.map((participant) => ({
          recipient_user_role_id: participant.user_role_id,
          type: "new_message",
          payload: { conversation_id: data.conversationId },
        })),
      );
    }

    return { ok: true };
  });
