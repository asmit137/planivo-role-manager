-- =====================================================
-- DEBUG: Permissive Vacation Access for Supervisors
-- =====================================================
-- Temporarily bypass complex scope checks to see if 
-- plans become visible. Use Security Definer.

-- 1. Permissive Workspace Detection
CREATE OR REPLACE FUNCTION public.get_user_workspaces(_user_id UUID)
RETURNS SETOF UUID SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY (
    SELECT DISTINCT workspace_id FROM public.user_roles WHERE user_id = _user_id AND workspace_id IS NOT NULL
    UNION
    SELECT DISTINCT f.workspace_id FROM public.user_roles ur JOIN public.facilities f ON ur.facility_id = f.id WHERE ur.user_id = _user_id
    UNION
    SELECT DISTINCT f.workspace_id FROM public.user_roles ur JOIN public.departments d ON ur.department_id = d.id JOIN public.facilities f ON d.facility_id = f.id WHERE ur.user_id = _user_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Permissive Vacation Access
CREATE OR REPLACE FUNCTION public.check_vacation_access(_staff_id UUID, _department_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- If user has ANY supervisor or admin role, allow them to view all plans for now 
  -- (This isolates if the issue is RLS matching or the routing itself)
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id 
    AND role IN (
      'super_admin', 'organization_admin', 'general_admin', 
      'workplace_supervisor', 'facility_supervisor', 'department_head'
    )
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN _staff_id = _user_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Simplified Approval Check
CREATE OR REPLACE FUNCTION public.can_approve_vacation_plan(_plan_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  SELECT staff_id INTO v_staff_id FROM public.vacation_plans WHERE id = _plan_id;
  IF v_staff_id = _user_id THEN RETURN FALSE; END IF;
  
  RETURN public.check_vacation_access(v_staff_id, NULL, _user_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- Notify schema change
NOTIFY pgrst, 'reload schema';
