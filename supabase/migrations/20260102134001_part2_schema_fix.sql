-- PART 2: Update the schema and policies
-- This SHOULD be run ONLY AFTER PART 1 has been successfully executed and committed.

-- Add specialty_id column to user_roles table
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS specialty_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- Add RLS policy for admins to update profiles (needed for the active switch)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'organization_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'organization_admin')
  );

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';
