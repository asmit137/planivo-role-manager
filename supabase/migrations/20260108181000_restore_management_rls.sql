-- =====================================================
-- FIX: Restore Management RLS for Facilities & Departments
-- =====================================================
-- Re-enable FOR ALL policies that were missing/dropped.

-- 1. Facilities Management
-- Allow Super Admins, Organization Admins, and Workspace Admins (General Admins) to manage facilities.
DROP POLICY IF EXISTS "Admins can manage facilities" ON public.facilities;
CREATE POLICY "Admins can manage facilities"
ON public.facilities FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'organization_admin') OR
  public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'organization_admin') OR
  public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
);

-- 2. Departments Management
-- Allow Super Admins, Org Admins, and scoped Admins/Supervisors to manage departments.
DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;
CREATE POLICY "Admins can manage departments"
ON public.departments FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'organization_admin') OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.facilities f ON f.id = departments.facility_id
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.role = 'general_admin' AND ur.workspace_id = f.workspace_id) OR
      (ur.role = 'facility_supervisor' AND ur.facility_id = f.id)
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'organization_admin') OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.facilities f ON f.id = departments.facility_id
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.role = 'general_admin' AND ur.workspace_id = f.workspace_id) OR
      (ur.role = 'facility_supervisor' AND ur.facility_id = f.id)
    )
  )
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
