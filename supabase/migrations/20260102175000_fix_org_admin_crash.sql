-- Add organization_admin to app_role if it doesn't exist
DO $$
BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'organization_admin';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update RLS policy for profiles to include organization_admin
-- First drop the old one to be clean (or create a new one to supplement)
DROP POLICY IF EXISTS "Admins can view workspace profiles" ON public.profiles;

CREATE POLICY "Admins can view workspace profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'general_admin', 'workplace_supervisor', 'organization_admin')
    )
  );

-- Update RLS for user_roles to allow reading organization admins?
-- "Super admins can manage all roles" covers super admins.
-- "Users can view their own roles" covers self.
-- If I am setting an owner, I need to see candidates.
-- Candidates are 'organization_admin's.
-- So I need a policy that allows viewing users with role 'organization_admin'.

CREATE POLICY "Admins can view organization admins"
  ON public.user_roles FOR SELECT
  USING (
    role = 'organization_admin' AND (
      public.has_role(auth.uid(), 'super_admin') OR
      public.has_role(auth.uid(), 'organization_admin') OR
      public.has_role(auth.uid(), 'general_admin')
    )
  );
