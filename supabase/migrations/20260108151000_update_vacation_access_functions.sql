-- =====================================================
-- FIX: Enhanced Vacation Access for Supervisors
-- =====================================================
-- Refine access functions to ensure supervisors can see 
-- and act on all plans within their scope.

-- 1. Update get_user_workspaces to be smart about hierarchies
-- This is critical for RLS policies on facilities, departments, etc.
CREATE OR REPLACE FUNCTION public.get_user_workspaces(_user_id UUID)
RETURNS SETOF UUID SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY (
    -- Directly assigned workspace
    SELECT DISTINCT workspace_id 
    FROM public.user_roles
    WHERE user_id = _user_id AND workspace_id IS NOT NULL
    UNION
    -- Workspace via facility assignment
    SELECT DISTINCT f.workspace_id
    FROM public.user_roles ur
    JOIN public.facilities f ON ur.facility_id = f.id
    WHERE ur.user_id = _user_id AND ur.facility_id IS NOT NULL
    UNION
    -- Workspace via department assignment
    SELECT DISTINCT f.workspace_id
    FROM public.user_roles ur
    JOIN public.departments d ON ur.department_id = d.id
    JOIN public.facilities f ON d.facility_id = f.id
    WHERE ur.user_id = _user_id AND ur.department_id IS NOT NULL
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Update check_vacation_access (Used for SELECT RLS)
-- Make this more permissive for supervisors and handle NULL departments.
CREATE OR REPLACE FUNCTION public.check_vacation_access(_staff_id UUID, _department_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1. Admins (Super/Org/General) have full/workspace access
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role IN ('super_admin'::app_role, 'organization_admin'::app_role, 'general_admin'::app_role)
  ) THEN
    RETURN TRUE;
  END IF;

  -- 2. User managing their own
  IF _staff_id = _user_id THEN
    RETURN TRUE;
  END IF;

  -- 3. Scope-based checks
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND (
      -- Workplace Supervisor (Workspace scope)
      -- Can see everything in workspace, regardless of department matching
      (ur.role = 'workplace_supervisor'::app_role AND (
        -- If plan has dept, check if dept belongs to workspace
        (_department_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.departments d 
          JOIN public.facilities f ON f.id = d.facility_id 
          WHERE d.id = _department_id AND f.workspace_id = ur.workspace_id
        )) OR
        -- If plan has no dept (e.g. from another supervisor), 
        -- check if requester belongs to this workspace via any role
        (_department_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_roles sur
          WHERE sur.user_id = _staff_id AND sur.workspace_id = ur.workspace_id
        ))
      )) OR
      -- Facility Supervisor (Facility scope)
      (ur.role = 'facility_supervisor'::app_role AND (
        (_department_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.departments d 
          WHERE d.id = _department_id AND d.facility_id = ur.facility_id
        )) OR
        (_department_id IS NULL AND EXISTS (
          SELECT 1 FROM public.user_roles sur
          WHERE sur.user_id = _staff_id AND sur.facility_id = ur.facility_id
        ))
      )) OR
      -- Department Head (Department scope)
      (ur.role = 'department_head'::app_role AND _department_id IS NOT NULL AND ur.department_id = _department_id)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Update can_approve_vacation_plan (Used for Status Changes)
CREATE OR REPLACE FUNCTION public.can_approve_vacation_plan(_plan_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept_id UUID;
  v_staff_id UUID;
BEGIN
  SELECT department_id, staff_id INTO v_dept_id, v_staff_id
  FROM public.vacation_plans WHERE id = _plan_id;
  
  -- Users cannot approve their own vacations
  IF v_staff_id = _user_id THEN RETURN FALSE; END IF;

  -- Use the access logic for approval check too (consistency)
  RETURN public.check_vacation_access(v_staff_id, v_dept_id, _user_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- Notify schema change
NOTIFY pgrst, 'reload schema';
