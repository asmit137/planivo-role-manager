-- ================================================================
-- FIX WORKSPACE CATEGORIES AND DEPARTMENTS RLS
-- ================================================================

-- 1. Policies for workspace_categories

-- Allow inserts (Super Admins, or Admins of that workspace)
DROP POLICY IF EXISTS "Admins can insert workspace categories" ON public.workspace_categories;
CREATE POLICY "Admins can insert workspace categories"
  ON public.workspace_categories FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Allow deletes (Super Admins, or Admins of that workspace)
DROP POLICY IF EXISTS "Admins can delete workspace categories" ON public.workspace_categories;
CREATE POLICY "Admins can delete workspace categories"
  ON public.workspace_categories FOR DELETE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Enable RLS just in case it wasn't enabled
ALTER TABLE public.workspace_categories ENABLE ROW LEVEL SECURITY;


-- 2. Policies for workspace_departments

-- Allow inserts (Super Admins, or Admins of that workspace)
DROP POLICY IF EXISTS "Admins can insert workspace departments" ON public.workspace_departments;
CREATE POLICY "Admins can insert workspace departments"
  ON public.workspace_departments FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Allow deletes (Super Admins, or Admins of that workspace)
DROP POLICY IF EXISTS "Admins can delete workspace departments" ON public.workspace_departments;
CREATE POLICY "Admins can delete workspace departments"
  ON public.workspace_departments FOR DELETE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Enable RLS just in case it wasn't enabled
ALTER TABLE public.workspace_departments ENABLE ROW LEVEL SECURITY;

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
