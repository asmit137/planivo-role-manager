-- =====================================================
-- PARALLEL VACATION APPROVAL WORKFLOW
-- =====================================================

-- 1. Update the approval check function
CREATE OR REPLACE FUNCTION public.can_approve_vacation_plan(_plan_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept_id UUID;
  v_staff_id UUID;
  v_approver_role app_role;
  v_staff_role app_role;
BEGIN
  -- Get plan details
  SELECT department_id, staff_id 
  INTO v_dept_id, v_staff_id
  FROM public.vacation_plans WHERE id = _plan_id;
  
  IF v_dept_id IS NULL THEN RETURN FALSE; END IF;
  
  -- Users cannot approve their own vacations
  IF v_staff_id = _user_id THEN RETURN FALSE; END IF;

  -- Get the role of the person trying to approve
  SELECT role INTO v_approver_role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
  
  -- SUPER ADMIN can approve EVERYTHING
  IF v_approver_role = 'super_admin'::app_role THEN
    RETURN TRUE;
  END IF;

  -- Get the role of the staff member who made the plan
  SELECT role INTO v_staff_role FROM public.user_roles WHERE user_id = v_staff_id LIMIT 1;

  -- RULE: Supervisors cannot approve other Supervisors/Heads. Only Super Admin can.
  IF v_staff_role IN ('department_head'::app_role, 'facility_supervisor'::app_role, 'workplace_supervisor'::app_role, 'general_admin'::app_role, 'organization_admin'::app_role) THEN
    RETURN FALSE; -- Already returned TRUE for super_admin above
  END IF;

  -- RULE: For regular STAFF, any supervisor in the chain can approve
  IF v_staff_role = 'staff'::app_role THEN
    -- Check Scope
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
      AND (
        -- Workplace Supervisor / General Admin (Workspace scope)
        (ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role) AND EXISTS (
          SELECT 1 FROM public.departments d 
          JOIN public.facilities f ON f.id = d.facility_id 
          WHERE d.id = v_dept_id AND f.workspace_id = ur.workspace_id
        )) OR
        -- Facility Supervisor (Facility scope)
        (ur.role = 'facility_supervisor'::app_role AND EXISTS (
          SELECT 1 FROM public.departments d 
          WHERE d.id = v_dept_id AND d.facility_id = ur.facility_id
        )) OR
        -- Department Head (Department scope)
        (ur.role = 'department_head'::app_role AND ur.department_id = v_dept_id)
      )
    );
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

NOTIFY pgrst, 'reload schema';
