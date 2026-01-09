-- =====================================================
-- AUTO-SYNC: Permanent Fix for Vacation Scope IDs
-- =====================================================
-- This trigger ensures facility_id and workspace_id are
-- ALWAYS populated based on the department_id, exactly 
-- like the Tasks table works.

-- 1. Create the sync function
CREATE OR REPLACE FUNCTION public.sync_vacation_scope_ids()
RETURNS TRIGGER AS $$
BEGIN
  -- If department_id is provided, find its facility and workspace
  IF NEW.department_id IS NOT NULL THEN
    SELECT d.facility_id, f.workspace_id 
    INTO NEW.facility_id, NEW.workspace_id
    FROM public.departments d
    LEFT JOIN public.facilities f ON d.facility_id = f.id
    WHERE d.id = NEW.department_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS tr_sync_vacation_scope_ids ON public.vacation_plans;
CREATE TRIGGER tr_sync_vacation_scope_ids
BEFORE INSERT OR UPDATE OF department_id ON public.vacation_plans
FOR EACH ROW EXECUTE FUNCTION public.sync_vacation_scope_ids();

-- 3. Robust Backfill (Manual Execution)
-- This fixes all existing NULLs that were missed
UPDATE public.vacation_plans vp
SET 
  facility_id = d.facility_id,
  workspace_id = f.workspace_id
FROM public.departments d
LEFT JOIN public.facilities f ON d.facility_id = f.id
WHERE vp.department_id = d.id
AND (vp.facility_id IS NULL OR vp.workspace_id IS NULL);

-- 4. Simplified RLS (Trust the direct columns)
DROP POLICY IF EXISTS "vacation_plans_unified_select" ON public.vacation_plans;
CREATE POLICY "vacation_plans_unified_select_v2"
ON public.vacation_plans FOR SELECT
TO authenticated
USING (
  staff_id = auth.uid() OR 
  created_by = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      ur.role IN ('super_admin', 'organization_admin', 'general_admin') OR
      (ur.role = 'workplace_supervisor' AND workspace_id = ur.workspace_id) OR
      (ur.role = 'facility_supervisor' AND facility_id = ur.facility_id) OR
      (ur.role = 'department_head' AND department_id = ur.department_id)
    )
  )
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
