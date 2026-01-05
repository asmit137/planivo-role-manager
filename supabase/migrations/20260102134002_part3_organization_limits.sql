-- PART 3: Update organizations table with limits and policies
-- This SHOULD be run ONLY AFTER PART 1 has been successfully executed.
-- (Part 2 and Part 3 are independent but both depend on Part 1 for the 'organization_admin' role)

-- Add missing columns to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS max_workspaces INTEGER,
ADD COLUMN IF NOT EXISTS max_facilities INTEGER,
ADD COLUMN IF NOT EXISTS max_users INTEGER;

-- Add RLS policy for organization admins to manage their own organization
DROP POLICY IF EXISTS "Organization admins can manage their own organization" ON public.organizations;
CREATE POLICY "Organization admins can manage their own organization"
  ON public.organizations FOR ALL
  USING (
    owner_id = auth.uid() OR
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'organization_admin') -- For backward compatibility if needed
  )
  WITH CHECK (
    owner_id = auth.uid() OR
    public.has_role(auth.uid(), 'super_admin')
  );

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';
