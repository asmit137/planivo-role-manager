-- =====================================================
-- FIX: Task RLS Policy (RECURSION BREAK)
-- =====================================================
-- This script fixes the "infinite recursion" by breaking the circular
-- dependency between tasks and task_assignments policies.

-- 1. Create Helper functions (Security Definer)
-- These functions bypass RLS to avoid circular checks.

-- Check if user is a creator of the task
CREATE OR REPLACE FUNCTION public.is_task_creator(_task_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.tasks WHERE id = _task_id AND created_by = _user_id);
$$ LANGUAGE sql STABLE;

-- Check if user is assigned to the task
CREATE OR REPLACE FUNCTION public.is_task_assignee(_task_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.task_assignments WHERE task_id = _task_id AND assigned_to = _user_id);
$$ LANGUAGE sql STABLE;

-- Drop old policies
DROP POLICY IF EXISTS "Users can create tasks based on role" ON public.tasks;
DROP POLICY IF EXISTS "Users can view tasks in their scope" ON public.tasks;
DROP POLICY IF EXISTS "Task creators can update their tasks" ON public.tasks;
DROP POLICY IF EXISTS "Task creators can create assignments" ON public.task_assignments;
DROP POLICY IF EXISTS "Users can view their assignments" ON public.task_assignments;

-- 2. New TASK POLICIES
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

CREATE POLICY "Users can view tasks in their scope"
ON public.tasks FOR SELECT TO authenticated
USING (
  created_by = auth.uid() OR
  is_task_assignee(id, auth.uid()) OR -- BREAKS RECURSION
  has_role(auth.uid(), 'super_admin'::app_role) OR
  has_role(auth.uid(), 'organization_admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role) AND workspace_id = ur.workspace_id) OR
      (ur.role = 'facility_supervisor'::app_role AND facility_id = ur.facility_id) OR
      (ur.role = 'department_head'::app_role AND department_id = ur.department_id) OR
      (ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role) AND (
        facility_id IN (SELECT id FROM public.facilities WHERE workspace_id = ur.workspace_id) OR
        department_id IN (SELECT d.id FROM public.departments d JOIN public.facilities f ON f.id = d.facility_id WHERE f.workspace_id = ur.workspace_id)
      )) OR
      (ur.role = 'facility_supervisor'::app_role AND (
        department_id IN (SELECT id FROM public.departments WHERE facility_id = ur.facility_id)
      ))
    )
  )
);

CREATE POLICY "Task creators can update their tasks"
ON public.tasks FOR UPDATE USING (created_by = auth.uid());

-- 3. New TASK ASSIGNMENT POLICIES
CREATE POLICY "Task creators can create assignments"
ON public.task_assignments FOR INSERT
WITH CHECK (is_task_creator(task_id, auth.uid())); -- BREAKS RECURSION

CREATE POLICY "Users can view their assignments"
ON public.task_assignments FOR SELECT
USING (
  assigned_to = auth.uid() OR
  is_task_creator(task_id, auth.uid()) -- BREAKS RECURSION
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
