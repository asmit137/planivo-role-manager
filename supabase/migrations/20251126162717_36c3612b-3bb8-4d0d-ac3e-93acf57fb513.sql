-- Fix messaging RLS infinite recursion by dropping problematic policy and creating non-recursive ones

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Users can view conversation participants" ON public.conversation_participants;

-- Create new non-recursive policy for viewing own participation
CREATE POLICY "Users can view their own participation"
ON public.conversation_participants FOR SELECT
USING (user_id = auth.uid());

-- Create policy for viewing co-participants using a security definer function
CREATE OR REPLACE FUNCTION public.user_has_conversation_access(conversation_uuid uuid, user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.conversation_participants 
    WHERE conversation_id = conversation_uuid 
      AND user_id = user_uuid
  )
$$;

-- Create policy for viewing other participants in conversations user is part of
CREATE POLICY "Users can view co-participants in their conversations"
ON public.conversation_participants FOR SELECT
USING (
  public.user_has_conversation_access(conversation_id, auth.uid())
);