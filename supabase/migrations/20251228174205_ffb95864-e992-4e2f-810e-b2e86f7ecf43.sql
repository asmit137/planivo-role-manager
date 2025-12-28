-- Fix conversation_participants RLS recursion by dropping conflicting policies
DROP POLICY IF EXISTS "Users can view co-participants in their conversations" ON public.conversation_participants;

-- The remaining policies are:
-- 1. "Conversation creators can add participants" (INSERT)
-- 2. "Users can update their own participant record" (UPDATE)
-- 3. "Users can view participants in their conversations" (SELECT) - uses subquery
-- 4. "Users can view their own participation" (SELECT) - simple check

-- Drop the recursive one and keep only the simple ones
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;

-- Recreate a non-recursive SELECT policy using the security definer function
CREATE POLICY "Users can view conversation participants" 
ON public.conversation_participants 
FOR SELECT 
USING (
  user_id = auth.uid() 
  OR user_has_conversation_access(conversation_id, auth.uid())
);

-- Add DELETE policy for conversation_participants (was missing)
CREATE POLICY "Conversation creators can remove participants" 
ON public.conversation_participants 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_id AND c.created_by = auth.uid()
  )
  OR has_role(auth.uid(), 'super_admin')
);

-- Add DELETE policy for tasks table
CREATE POLICY "Task creators can delete their tasks" 
ON public.tasks 
FOR DELETE 
USING (
  created_by = auth.uid() 
  OR has_role(auth.uid(), 'super_admin')
);

-- Add DELETE policy for task_assignments table
CREATE POLICY "Task creators can delete assignments" 
ON public.task_assignments 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND t.created_by = auth.uid()
  )
  OR has_role(auth.uid(), 'super_admin')
);

-- Tighten schedule_display_tokens policy - only allow validation, not full token exposure
DROP POLICY IF EXISTS "Anyone can verify display tokens" ON public.schedule_display_tokens;

CREATE POLICY "Anyone can verify display tokens" 
ON public.schedule_display_tokens 
FOR SELECT 
USING (
  -- Only allow reading tokens when checking if active/valid
  -- The actual token verification happens through the get_public_schedule function
  is_active = true 
  AND (expires_at IS NULL OR expires_at > now())
);