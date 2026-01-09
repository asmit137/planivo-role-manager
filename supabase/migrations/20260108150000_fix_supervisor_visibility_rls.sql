-- =====================================================
-- FIX: Supervisor Visibility RLS (Safe Version)
-- =====================================================
-- Ensure Facility and Workspace Supervisors can see staff
-- profiles, roles, and departments to process approvals.
-- Use security-definer functions to avoid recursion.

-- 1. Profiles: Expand visibility for supervisors
DROP POLICY IF EXISTS "Admins can view workspace profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view profiles in scope" ON public.profiles;

CREATE POLICY "Supervisors can view profiles in scope"
ON public.profiles FOR SELECT
USING (
  id = auth.uid() OR
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'organization_admin') OR
  public.has_role(auth.uid(), 'general_admin') OR
  public.has_role(auth.uid(), 'workplace_supervisor') OR
  public.has_role(auth.uid(), 'facility_supervisor') OR
  public.has_role(auth.uid(), 'department_head')
);

-- 2. User Roles: Revert to safe policy + use SECURITY DEFINER for expansion
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Supervisors can view roles in scope" ON public.user_roles;

-- ALWAYS allow users to see their own roles (Safe, No Recursion)
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

-- Allow supervisors to see roles of others (Safe, Uses Security Definer)
CREATE POLICY "Supervisors can view other roles"
ON public.user_roles FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'organization_admin') OR
  public.has_role(auth.uid(), 'general_admin') OR
  public.has_role(auth.uid(), 'workplace_supervisor') OR
  public.has_role(auth.uid(), 'facility_supervisor') OR
  public.has_role(auth.uid(), 'department_head')
);

-- 3. Departments: Ensure supervisors can always see departments
DROP POLICY IF EXISTS "Users can view workspace departments" ON public.departments;
DROP POLICY IF EXISTS "Supervisors can view departments" ON public.departments;

CREATE POLICY "Supervisors can view departments"
ON public.departments FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'organization_admin') OR
  public.has_role(auth.uid(), 'general_admin') OR
  public.has_role(auth.uid(), 'workplace_supervisor') OR
  public.has_role(auth.uid(), 'facility_supervisor') OR
  public.has_role(auth.uid(), 'department_head')
);

-- 4. Facilities: Ensure supervisors can always see facilities
DROP POLICY IF EXISTS "Users can view workspace facilities" ON public.facilities;
DROP POLICY IF EXISTS "Supervisors can view facilities" ON public.facilities;

CREATE POLICY "Supervisors can view facilities"
ON public.facilities FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin') OR
  public.has_role(auth.uid(), 'organization_admin') OR
  public.has_role(auth.uid(), 'general_admin') OR
  public.has_role(auth.uid(), 'workplace_supervisor') OR
  public.has_role(auth.uid(), 'facility_supervisor') OR
  public.has_role(auth.uid(), 'department_head')
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
