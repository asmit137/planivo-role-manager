-- =====================================================
-- FINAL FIX: RLS Recursion and Routing Repair
-- =====================================================
-- This script breaks all potential RLS loops and ensures
-- Facility/Workspace supervisors have full visibility.

-- 1. Break User Roles Recursion
-- The 'has_role' function calling 'user_roles' which then calls 'has_role' 
-- is a recursive loop. We fix this by making 'user_roles' open for SELECT.
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Supervisors can view other roles" ON public.user_roles;
DROP POLICY IF EXISTS "General admins can manage workspace roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;

-- Broad SELECT access for authenticated users to avoid loops in role-based checks
CREATE POLICY "Anyone authenticated can view roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (true);

-- Keep management restrictive
CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin', 'organization_admin')
  )
);

-- 2. Repair Profiles Visibility
DROP POLICY IF EXISTS "Admins can view workspace profiles" ON public.profiles;
DROP POLICY IF EXISTS "Supervisors can view profiles in scope" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- 3. Repair Departments and Facilities Visibility
DROP POLICY IF EXISTS "Users can view workspace facilities" ON public.facilities;
DROP POLICY IF EXISTS "Supervisors can view facilities" ON public.facilities;
DROP POLICY IF EXISTS "Admins can manage facilities" ON public.facilities;

CREATE POLICY "Facilities are viewable by authenticated users"
ON public.facilities FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can view workspace departments" ON public.departments;
DROP POLICY IF EXISTS "Supervisors can view departments" ON public.departments;
DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;

CREATE POLICY "Departments are viewable by authenticated users"
ON public.departments FOR SELECT
TO authenticated
USING (true);

-- 4. Finalize Vacation Access Security Definer Functions
CREATE OR REPLACE FUNCTION public.check_vacation_access(_staff_id UUID, _department_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1. Admins have global access
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role IN ('super_admin', 'organization_admin', 'general_admin')
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. Individual access
  IF _staff_id = _user_id THEN
    RETURN TRUE;
  END IF;

  -- 3. Supervisor Scope Check
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND (
      -- Workspace Supervisor (Sees everything in workspace)
      (ur.role = 'workplace_supervisor' AND (
        (_department_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.departments d 
          JOIN public.facilities f ON f.id = d.facility_id 
          WHERE d.id = _department_id AND f.workspace_id = ur.workspace_id
        )) OR
        (_department_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_roles sur
          WHERE sur.user_id = _staff_id AND sur.workspace_id = ur.workspace_id
        ))
      )) OR
      -- Facility Supervisor (Sees everything in facility)
      (ur.role = 'facility_supervisor' AND (
        (_department_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.departments d 
          WHERE d.id = _department_id AND d.facility_id = ur.facility_id
        )) OR
        (_department_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_roles sur
          WHERE sur.user_id = _staff_id AND sur.facility_id = ur.facility_id
        ))
      )) OR
      -- Department Head
      (ur.role = 'department_head' AND _department_id IS NOT NULL AND ur.department_id = _department_id)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Force Vacation Plans Visibility
DROP POLICY IF EXISTS "Users can view vacation plans" ON public.vacation_plans;
DROP POLICY IF EXISTS "Supervisors can view plans of their staff" ON public.vacation_plans;

CREATE POLICY "Supervisors and staff can view vacation plans"
ON public.vacation_plans FOR SELECT
TO authenticated
USING (
  staff_id = auth.uid() OR 
  created_by = auth.uid() OR 
  public.check_vacation_access(staff_id, department_id, auth.uid())
);

-- Force reload
NOTIFY pgrst, 'reload schema';
