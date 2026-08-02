CREATE OR REPLACE FUNCTION app_private.is_conversation_participant(_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = _conversation_id
      AND cp.user_role_id IN (SELECT app_private.auth_user_role_ids())
  );
$$;

REVOKE ALL ON FUNCTION app_private.is_conversation_participant(uuid) FROM public;
GRANT EXECUTE ON FUNCTION app_private.is_conversation_participant(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS conversation_participants_select ON public.conversation_participants;
CREATE POLICY conversation_participants_select
  ON public.conversation_participants FOR SELECT
  TO authenticated
  USING (
    user_role_id IN (SELECT app_private.auth_user_role_ids())
    OR app_private.is_conversation_participant(conversation_id)
    OR app_private.is_platform_admin()
  );

DROP POLICY IF EXISTS conversations_select ON public.conversations;
CREATE POLICY conversations_select
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    app_private.is_conversation_participant(id)
    OR app_private.is_platform_admin()
  );

DROP POLICY IF EXISTS messages_select ON public.messages;
CREATE POLICY messages_select
  ON public.messages FOR SELECT
  TO authenticated
  USING (app_private.is_conversation_participant(conversation_id));

DROP POLICY IF EXISTS messages_update ON public.messages;
CREATE POLICY messages_update
  ON public.messages FOR UPDATE
  TO authenticated
  USING (app_private.is_conversation_participant(conversation_id))
  WITH CHECK (app_private.is_conversation_participant(conversation_id));

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_user_role_id IN (SELECT app_private.auth_user_role_ids())
    AND app_private.is_conversation_participant(conversation_id)
  );