-- =====================================================
-- FIX: Vacation Plans RLS Policy (RECURSION BREAK)
-- =====================================================
-- This script fixes the "new row violates RLS" error and
-- potential recursion in vacation_plans.

-- 1. Create Helper Functions (Security Definer)
-- These break circular dependencies and bypass RLS for checks

-- Checks if a user can manage/view a specific staff's vacation in a department
CREATE OR REPLACE FUNCTION public.check_vacation_access(_staff_id UUID, _department_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- 1. Super admins / Org admins
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = _user_id AND role IN ('super_admin'::app_role, 'organization_admin'::app_role)
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
      -- Workplace Supervisor / General Admin (Workspace scope)
      (ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role) AND EXISTS (
        SELECT 1 FROM public.departments d 
        JOIN public.facilities f ON f.id = d.facility_id 
        WHERE d.id = _department_id AND f.workspace_id = ur.workspace_id
      )) OR
      -- Facility Supervisor (Facility scope)
      (ur.role = 'facility_supervisor'::app_role AND EXISTS (
        SELECT 1 FROM public.departments d 
        WHERE d.id = _department_id AND d.facility_id = ur.facility_id
      )) OR
      -- Department Head (Department scope)
      (ur.role = 'department_head'::app_role AND ur.department_id = _department_id)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Check function for existing plans (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_access_to_plan(_plan_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_staff_id UUID;
  v_dept_id UUID;
  v_creator_id UUID;
BEGIN
  SELECT staff_id, department_id, created_by INTO v_staff_id, v_dept_id, v_creator_id
  FROM public.vacation_plans WHERE id = _plan_id;
  
  IF v_staff_id IS NULL THEN RETURN FALSE; END IF;
  
  RETURN v_creator_id = _user_id OR check_vacation_access(v_staff_id, v_dept_id, _user_id);
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Update Policies
DROP POLICY IF EXISTS "Department heads can create plans for their department" ON public.vacation_plans;
DROP POLICY IF EXISTS "Users can view plans in their scope" ON public.vacation_plans;
DROP POLICY IF EXISTS "Plan creators can update draft plans" ON public.vacation_plans;
DROP POLICY IF EXISTS "Users can update vacation plans based on role and status" ON public.vacation_plans;

-- INSERT: Use the access check
CREATE POLICY "Users can create vacation plans" 
ON public.vacation_plans FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by AND 
  check_vacation_access(staff_id, department_id, auth.uid())
);

-- SELECT: Use the access check
CREATE POLICY "Users can view vacation plans" 
ON public.vacation_plans FOR SELECT TO authenticated
USING (
  staff_id = auth.uid() OR 
  created_by = auth.uid() OR 
  check_vacation_access(staff_id, department_id, auth.uid())
);

-- UPDATE: Use the plan-based access check
CREATE POLICY "Users can update vacation plans" 
ON public.vacation_plans FOR UPDATE TO authenticated
USING (has_access_to_plan(id, auth.uid()))
WITH CHECK (has_access_to_plan(id, auth.uid()));

-- DELETE: Owner/Creator/Admin can delete drafts
DROP POLICY IF EXISTS "Users can delete vacation plans" ON public.vacation_plans;
CREATE POLICY "Users can delete vacation plans" 
ON public.vacation_plans FOR DELETE TO authenticated
USING (
  (staff_id = auth.uid() OR created_by = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role))
  AND status = 'draft'
);

-- 3. Vacation Splits Policies
DROP POLICY IF EXISTS "Splits inherit vacation_plan permissions" ON public.vacation_splits;

CREATE POLICY "Users can manage vacation splits" 
ON public.vacation_splits FOR ALL TO authenticated
USING (has_access_to_plan(vacation_plan_id, auth.uid()))
WITH CHECK (has_access_to_plan(vacation_plan_id, auth.uid()));

-- Notify schema change
NOTIFY pgrst, 'reload schema';
