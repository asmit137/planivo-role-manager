-- =====================================================
-- UNIFIED SCOPE: Align Vacation Plans with Tasks Table
-- =====================================================
-- Adding direct scope columns to vacation_plans to fix
-- supervisor routing and break RLS recursion definitively.

-- 1. Add columns to vacation_plans
ALTER TABLE public.vacation_plans 
ADD COLUMN IF NOT EXISTS facility_id UUID REFERENCES public.facilities(id),
ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id);

-- 2. Backfill existing data
UPDATE public.vacation_plans vp
SET 
  facility_id = d.facility_id,
  workspace_id = f.workspace_id
FROM public.departments d
JOIN public.facilities f ON d.facility_id = f.id
WHERE vp.department_id = d.id;

-- 3. Simplified check_vacation_access (No joins needed!)
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

  -- 3. Scope-based checks (Direct matching, no joins!)
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.vacation_plans vp ON (
      -- Extract the plan context. Note: This function is used in RLS filters.
      -- When used in RLS, we can match against the 'vacation_plans' columns directly
      -- if we pass the NEW/OLD row values or use variables.
      -- To keep it clean for existing RLS calls:
      vp.staff_id = _staff_id AND vp.department_id = _department_id
    )
    WHERE ur.user_id = _user_id
    AND (
      -- Workplace Supervisor (Workspace scope)
      (ur.role = 'workplace_supervisor'::app_role AND vp.workspace_id = ur.workspace_id) OR
      -- Facility Supervisor (Facility scope)
      (ur.role = 'facility_supervisor'::app_role AND vp.facility_id = ur.facility_id) OR
      -- Department Head (Department scope)
      (ur.role = 'department_head'::app_role AND vp.department_id = ur.department_id)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Unified RLS Policy for vacation_plans
-- This uses the NEW columns for absolute speed and reliability
DROP POLICY IF EXISTS "Supervisors and staff can view vacation plans" ON public.vacation_plans;
DROP POLICY IF EXISTS "vacation_plans_select_v2" ON public.vacation_plans;
DROP POLICY IF EXISTS "Users can view vacation plans" ON public.vacation_plans;

CREATE POLICY "vacation_plans_unified_select"
ON public.vacation_plans FOR SELECT
TO authenticated
USING (
  staff_id = auth.uid() OR 
  created_by = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      ur.role = 'super_admin'::app_role OR
      (ur.role = 'workplace_supervisor'::app_role AND workspace_id = ur.workspace_id) OR
      (ur.role = 'facility_supervisor'::app_role AND facility_id = ur.facility_id) OR
      (ur.role = 'department_head'::app_role AND department_id = ur.department_id)
    )
  )
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
