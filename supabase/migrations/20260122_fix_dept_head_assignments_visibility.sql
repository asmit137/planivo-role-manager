-- Expand task assignment visibility for Department Heads and Facility Supervisors
-- Run this in the Supabase SQL Editor to allow these roles to view assignments for tasks in their scope.

DROP POLICY IF EXISTS "Users can view their assignments" ON public.task_assignments;

CREATE POLICY "Users can view their assignments"
ON public.task_assignments FOR SELECT
USING (
  assigned_to = auth.uid() OR
  is_task_creator(task_id, auth.uid()) OR
  EXISTS (
    SELECT 1 FROM public.tasks t
    JOIN public.user_roles ur ON ur.user_id = auth.uid()
    WHERE t.id = task_assignments.task_id
    AND (
      ur.role IN ('super_admin', 'organization_admin') OR
      (ur.role = 'department_head' AND t.department_id = ur.department_id) OR
      (ur.role = 'facility_supervisor' AND t.facility_id = ur.facility_id)
    )
  )
);

NOTIFY pgrst, 'reload schema';
