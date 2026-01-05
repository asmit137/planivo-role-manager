-- =====================================================
-- EXPAND: Task Scope for Global Management
-- =====================================================
-- This script adds 'organization' to the tasks table 
-- scope_type and updates RLS policies for global access.

-- 1. Update the scope_type constraint on tasks table
ALTER TABLE public.tasks 
  DROP CONSTRAINT IF EXISTS tasks_scope_type_check;

ALTER TABLE public.tasks 
  ADD CONSTRAINT tasks_scope_type_check 
  CHECK (scope_type IN ('workspace', 'facility', 'department', 'organization'));

-- 2. Update RLS policies to allow Super Admins to manage organization tasks
DROP POLICY IF EXISTS "Users can create tasks based on role" ON public.tasks;

CREATE POLICY "Users can create tasks based on role" 
ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by AND (
    has_role(auth.uid(), 'super_admin'::app_role) OR 
    has_role(auth.uid(), 'organization_admin'::app_role) OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND (
        (ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role) AND (
          (scope_type = 'workspace' AND workspace_id = ur.workspace_id) OR
          (scope_type = 'facility' AND facility_id IN (SELECT id FROM public.facilities WHERE workspace_id = ur.workspace_id)) OR
          (scope_type = 'department' AND department_id IN (SELECT d.id FROM public.departments d JOIN public.facilities f ON f.id = d.facility_id WHERE f.workspace_id = ur.workspace_id))
        )) OR
        (ur.role = 'facility_supervisor'::app_role AND (
          (scope_type = 'facility' AND facility_id = ur.facility_id) OR
          (scope_type = 'department' AND department_id IN (SELECT id FROM public.departments WHERE facility_id = ur.facility_id))
        )) OR
        (ur.role = 'department_head'::app_role AND scope_type = 'department' AND department_id = ur.department_id)
      )
    )
  )
);

-- 3. Ensure assignment policy supports global tasks
DROP POLICY IF EXISTS "Task creators can create assignments" ON public.task_assignments;

CREATE POLICY "Task creators can create assignments"
ON public.task_assignments FOR INSERT
WITH CHECK (is_task_creator(task_id, auth.uid()));

-- Notify schema change
NOTIFY pgrst, 'reload schema';
