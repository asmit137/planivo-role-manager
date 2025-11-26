-- Drop the existing problematic UPDATE policy
DROP POLICY IF EXISTS "Plan creators and department heads can update draft plans" ON public.vacation_plans;

-- Create comprehensive UPDATE policy with proper USING and WITH CHECK clauses
CREATE POLICY "Users can update vacation plans based on role and status"
ON public.vacation_plans FOR UPDATE
USING (
  -- Who can update which plans (based on current row state)
  (
    -- Creators and staff can update their own draft plans
    (status = 'draft' AND (created_by = auth.uid() OR staff_id = auth.uid()))
    OR
    -- Department heads can update draft plans in their department
    (status = 'draft' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'department_head'
        AND ur.department_id = vacation_plans.department_id
    ))
    OR
    -- Department heads can approve/reject department_pending plans
    (status = 'department_pending' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'department_head'
        AND ur.department_id = vacation_plans.department_id
    ))
    OR
    -- Facility supervisors can approve/reject facility_pending plans
    (status = 'facility_pending' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.departments d ON d.id = vacation_plans.department_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'facility_supervisor'
        AND ur.facility_id = d.facility_id
    ))
    OR
    -- Workspace supervisors can approve/reject workspace_pending plans
    (status = 'workspace_pending' AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.departments d ON d.id = vacation_plans.department_id
      JOIN public.facilities f ON f.id = d.facility_id
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'workplace_supervisor'
        AND ur.workspace_id = f.workspace_id
    ))
    OR
    -- Super admin can update any plan
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  )
)
WITH CHECK (true);  -- Allow writing the new values