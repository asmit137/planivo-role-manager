-- =====================================================
-- SIMPLIFY: Vacation Approval Workflow
-- =====================================================
-- This script simplifies the multi-level vacation approval
-- to a single-step process: any authorized role can approve.

-- 1. Create/Update access function for approval
CREATE OR REPLACE FUNCTION public.can_approve_vacation_plan(_plan_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept_id UUID;
  v_staff_id UUID;
BEGIN
  SELECT department_id, staff_id INTO v_dept_id, v_staff_id
  FROM public.vacation_plans WHERE id = _plan_id;
  
  IF v_dept_id IS NULL THEN RETURN FALSE; END IF;
  
  -- Users cannot approve their own vacations
  IF v_staff_id = _user_id THEN RETURN FALSE; END IF;

  -- Super admins / Org admins
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role IN ('super_admin'::app_role, 'organization_admin'::app_role)
  ) THEN
    RETURN TRUE;
  END IF;

  -- Scope-based checks for supervisors
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
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Update status constraint if necessary (keeping all for compatibility but labeling the workflow)
COMMENT ON COLUMN vacation_plans.status IS 'Simplified workflow: draft -> pending (any) -> approved. Statuses department_pending, facility_pending, and workspace_pending are treated as "pending review".';

-- 3. Update RLS policies to allow ANY authorized person to move to 'approved'
DROP POLICY IF EXISTS "Users can update vacation plans" ON public.vacation_plans;

CREATE POLICY "Users can update vacation plans" 
ON public.vacation_plans FOR UPDATE TO authenticated
USING (has_access_to_plan(id, auth.uid()))
WITH CHECK (
  -- If changing status to approved/rejected, must have approval permission
  (
    (CASE 
      WHEN status IN ('approved', 'rejected') THEN can_approve_vacation_plan(id, auth.uid())
      ELSE has_access_to_plan(id, auth.uid())
    END)
  )
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
