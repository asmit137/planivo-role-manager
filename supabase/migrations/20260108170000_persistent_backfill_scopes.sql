-- =====================================================
-- DEEP REPAIR: Force-Populate Vacation Scope Columns
-- =====================================================
-- This migration runs an aggressive backfill and ensures 
-- security policies allow for recovery if IDs are missing.

-- 1. Aggressive Backfill using multiple join paths
-- Path A: Direct via departments
UPDATE public.vacation_plans vp
SET 
  facility_id = d.facility_id,
  workspace_id = f.workspace_id
FROM public.departments d
JOIN public.facilities f ON d.facility_id = f.id
WHERE vp.department_id = d.id
AND (vp.facility_id IS NULL OR vp.workspace_id IS NULL);

-- Path B: Fallback via staff profiles (if department_id was missing/wrong but staff has a primary role)
-- Only run if there are still NULLs
UPDATE public.vacation_plans vp
SET 
  facility_id = ur.facility_id,
  workspace_id = ur.workspace_id
FROM public.user_roles ur
WHERE vp.staff_id = ur.user_id
AND ur.role = 'staff'
AND (vp.facility_id IS NULL OR vp.workspace_id IS NULL);

-- 2. Security "Master Key" for Super Admins
-- Update the SELECT policy to be absolutely permissive for Super Admins
DROP POLICY IF EXISTS "vacation_plans_unified_select_v2" ON public.vacation_plans;
CREATE POLICY "vacation_plans_final_select"
ON public.vacation_plans FOR SELECT
TO authenticated
USING (
  -- Super Admin bypass (Check metadata directly if possible or use function)
  public.has_role(auth.uid(), 'super_admin') OR
  staff_id = auth.uid() OR 
  created_by = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.role = 'workplace_supervisor' AND workspace_id = ur.workspace_id) OR
      (ur.role = 'facility_supervisor' AND facility_id = ur.facility_id) OR
      (ur.role = 'department_head' AND department_id = ur.department_id)
    )
  )
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
