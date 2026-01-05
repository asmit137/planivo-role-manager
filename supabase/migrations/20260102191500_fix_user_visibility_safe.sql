-- Create a security definer function to get current user's workspace IDs safely
-- This bypasses RLS to avoid recursion when policies need to know the user's scope
CREATE OR REPLACE FUNCTION public.get_user_workspace_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ARRAY(
    SELECT DISTINCT workspace_id 
    FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND workspace_id IS NOT NULL
  );
$$;

-- Create a security definer function to get current user's facility IDs safely
CREATE OR REPLACE FUNCTION public.get_user_facility_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ARRAY(
    SELECT DISTINCT facility_id 
    FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND facility_id IS NOT NULL
  );
$$;

-- Update profiles policy to allow viewing colleagues
DROP POLICY IF EXISTS "Users can view workspace profiles" ON public.profiles;
CREATE POLICY "Users can view workspace profiles"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid() -- View self
    OR
    EXISTS ( -- View users who have a role in my workspaces
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = profiles.id
      AND ur.workspace_id = ANY(get_user_workspace_ids())
    )
    OR has_role(auth.uid(), 'super_admin')
  );

-- Update user_roles policy to allow viewing colleagues' roles
-- We previously dropped "Users can view workspace roles" to fix login.
-- Now we re-add it safely.
DROP POLICY IF EXISTS "Users can view workspace roles" ON public.user_roles;

CREATE POLICY "Users can view workspace roles"
  ON public.user_roles FOR SELECT
  USING (
    user_id = auth.uid() -- View own roles (redundant with "Users can view own role" but fine)
    OR
    workspace_id = ANY(get_user_workspace_ids()) -- View roles in my workspaces
    OR
    has_role(auth.uid(), 'super_admin')
  );

-- Ensure "Users can view own role" is there (it should be from previous step, but safe to ensure)
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());
