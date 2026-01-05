-- NUCLEAR CLEANUP: Drop every single policy on conversations table
DO $$ 
DECLARE 
    pol RECORD;
BEGIN 
    FOR pol IN (
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'conversations' AND schemaname = 'public'
    ) 
    LOOP 
        EXECUTE format('DROP POLICY %I ON public.conversations', pol.policyname); 
    END LOOP; 
END $$;

-- 1. SUPER ADMIN BYPASS: Allow everything for super admins
CREATE POLICY "conversations_super_admin_all"
ON public.conversations FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- 2. INSERT POLICY: Allow DMs and Groups for all authenticated users
CREATE POLICY "conversations_insert_authenticated"
ON public.conversations FOR INSERT
TO authenticated
WITH CHECK (
  (type IN ('dm', 'group')) OR
  (type = 'channel' AND (
    has_role(auth.uid(), 'super_admin') OR 
    has_role(auth.uid(), 'department_head') OR
    has_role(auth.uid(), 'workplace_supervisor') OR
    has_role(auth.uid(), 'facility_supervisor')
  ))
);

-- 3. SELECT POLICY: View participating conversations or public channels
CREATE POLICY "conversations_select_authenticated"
ON public.conversations FOR SELECT
TO authenticated
USING (
  (type = 'channel') OR 
  (id IN (SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid()))
);

-- 4. UPDATE POLICY: Allow updates for participants (needed for triggers)
CREATE POLICY "conversations_update_authenticated"
ON public.conversations FOR UPDATE
TO authenticated
USING (
  (id IN (SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid())) OR
  (created_by = auth.uid())
)
WITH CHECK (
  (id IN (SELECT conversation_id FROM public.conversation_participants WHERE user_id = auth.uid())) OR
  (created_by = auth.uid())
);

-- 5. DELETE POLICY: Creators only
CREATE POLICY "conversations_delete_authenticated"
ON public.conversations FOR DELETE
TO authenticated
USING (created_by = auth.uid());
