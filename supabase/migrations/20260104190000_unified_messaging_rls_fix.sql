-- ==========================================================
-- 0. HELPER FUNCTION: SECURITY DEFINER to avoid RLS recursion
-- ==========================================================
CREATE OR REPLACE FUNCTION public.is_msg_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  );
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- ==========================================================
-- NUCLEAR CLEANUP: Drop all dynamic policies for Messaging
-- ==========================================================
DO $$ 
DECLARE 
    tbl TEXT;
    pol RECORD;
BEGIN 
    FOR tbl IN VALUES ('conversations'), ('conversation_participants'), ('messages')
    LOOP
        FOR pol IN (
            SELECT policyname 
            FROM pg_policies 
            WHERE tablename = tbl AND schemaname = 'public'
        ) 
        LOOP 
            EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, tbl); 
        END LOOP;
    END LOOP; 
END $$;

-- ==========================================================
-- 1. CONVERSATIONS POLICIES
-- ==========================================================

-- SUPER ADMIN: Allow all
CREATE POLICY "messaging_conversations_super_admin"
ON public.conversations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- INSERT: 
-- 1. Everyone can create DMs.
-- 2. Only NON-STAFF (Admins/Supervisors) can create Groups.
-- 3. Only Admins/Supervisors can create Channels.
CREATE POLICY "messaging_conversations_insert"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (
  (type = 'dm') OR
  (type IN ('group', 'channel') AND (
    public.has_role(auth.uid(), 'super_admin') OR 
    public.has_role(auth.uid(), 'general_admin') OR
    public.has_role(auth.uid(), 'workplace_supervisor') OR
    public.has_role(auth.uid(), 'facility_supervisor') OR
    public.has_role(auth.uid(), 'department_head')
  ))
);

-- SELECT: View channels OR conversations where you are a participant OR creator
-- (Creator check is vital for the .select() call immediately after insert)
CREATE POLICY "messaging_conversations_select"
ON public.conversations FOR SELECT
TO authenticated
USING (
  (type = 'channel') OR 
  (public.is_msg_participant(id, auth.uid())) OR
  (created_by = auth.uid()) 
);

-- UPDATE: Allow updates for participants or creators
CREATE POLICY "messaging_conversations_update"
ON public.conversations FOR UPDATE
TO authenticated
USING (
  (public.is_msg_participant(id, auth.uid())) OR
  (created_by = auth.uid())
)
WITH CHECK (
  (public.is_msg_participant(id, auth.uid())) OR
  (created_by = auth.uid())
);

-- DELETE: Super admins or creator
CREATE POLICY "messaging_conversations_delete"
ON public.conversations FOR DELETE
TO authenticated
USING (
  (created_by = auth.uid()) OR
  (public.has_role(auth.uid(), 'super_admin'))
);

-- ==========================================================
-- 2. CONVERSATION PARTICIPANTS POLICIES
-- ==========================================================

-- SUPER ADMIN: Allow all
CREATE POLICY "messaging_participants_super_admin"
ON public.conversation_participants FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- INSERT: Allow adding self OR adding anyone IF you are the conversation creator
CREATE POLICY "messaging_participants_insert"
ON public.conversation_participants FOR INSERT
TO authenticated
WITH CHECK (
  (user_id = auth.uid()) OR
  (EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = conversation_id AND created_by = auth.uid()
  ))
);

-- SELECT: View participants if you are in the same conversation OR if you created it
CREATE POLICY "messaging_participants_select"
ON public.conversation_participants FOR SELECT
TO authenticated
USING (
  (public.is_msg_participant(conversation_id, auth.uid())) OR
  (EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = conversation_id AND created_by = auth.uid()
  ))
);

-- UPDATE/DELETE: Manage your own membership
CREATE POLICY "messaging_participants_manage_self"
ON public.conversation_participants FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ==========================================================
-- 3. MESSAGES POLICIES
-- ==========================================================

-- SUPER ADMIN: Allow all
CREATE POLICY "messaging_messages_super_admin"
ON public.messages FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- INSERT: Send if participant
CREATE POLICY "messaging_messages_insert"
ON public.messages FOR INSERT
TO authenticated
WITH CHECK (
  (sender_id = auth.uid()) AND
  (public.is_msg_participant(conversation_id, auth.uid()))
);

-- SELECT: View if participant
CREATE POLICY "messaging_messages_select"
ON public.messages FOR SELECT
TO authenticated
USING (
  (public.is_msg_participant(conversation_id, auth.uid())) OR
  (EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = messages.conversation_id AND created_by = auth.uid()
  ))
);

-- UPDATE: Own messages
CREATE POLICY "messaging_messages_update"
ON public.messages FOR UPDATE
TO authenticated
USING (sender_id = auth.uid())
WITH CHECK (sender_id = auth.uid());

-- DELETE: Own messages or creator of conversation
CREATE POLICY "messaging_messages_delete"
ON public.messages FOR DELETE
TO authenticated
USING (
  (sender_id = auth.uid()) OR
  (EXISTS (
    SELECT 1 FROM public.conversations
    WHERE id = messages.conversation_id AND created_by = auth.uid()
  ))
);
