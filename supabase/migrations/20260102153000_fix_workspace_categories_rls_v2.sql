-- ================================================================
-- FIX WORKSPACE CATEGORIES AND DEPARTMENTS RLS (V2 - Complete)
-- ================================================================

-- 1. Policies for workspace_categories
-- We need Insert, Update (for upsert), and Delete policies.

ALTER TABLE public.workspace_categories ENABLE ROW LEVEL SECURITY;

-- Insert
DROP POLICY IF EXISTS "Admins can insert workspace categories" ON public.workspace_categories;
CREATE POLICY "Admins can insert workspace categories"
  ON public.workspace_categories FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Update (Required for UPSERT even if ignoreDuplicates is true)
DROP POLICY IF EXISTS "Admins can update workspace categories" ON public.workspace_categories;
CREATE POLICY "Admins can update workspace categories"
  ON public.workspace_categories FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Delete
DROP POLICY IF EXISTS "Admins can delete workspace categories" ON public.workspace_categories;
CREATE POLICY "Admins can delete workspace categories"
  ON public.workspace_categories FOR DELETE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Select (Ensure this exists)
DROP POLICY IF EXISTS "Users can view workspace categories" ON public.workspace_categories;
CREATE POLICY "Users can view workspace categories"
  ON public.workspace_categories FOR SELECT
  USING (true);


-- 2. Policies for workspace_departments
ALTER TABLE public.workspace_departments ENABLE ROW LEVEL SECURITY;

-- Insert
DROP POLICY IF EXISTS "Admins can insert workspace departments" ON public.workspace_departments;
CREATE POLICY "Admins can insert workspace departments"
  ON public.workspace_departments FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Update
DROP POLICY IF EXISTS "Admins can update workspace departments" ON public.workspace_departments;
CREATE POLICY "Admins can update workspace departments"
  ON public.workspace_departments FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Delete
DROP POLICY IF EXISTS "Admins can delete workspace departments" ON public.workspace_departments;
CREATE POLICY "Admins can delete workspace departments"
  ON public.workspace_departments FOR DELETE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Select
DROP POLICY IF EXISTS "Users can view workspace departments" ON public.workspace_departments;
CREATE POLICY "Users can view workspace departments"
  ON public.workspace_departments FOR SELECT
  USING (true);

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
