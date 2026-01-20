-- =====================================================
-- FIX: Missing DELETE RLS policies for Tasks
-- =====================================================
-- This script adds the missing DELETE policies to allow 
-- creators and admins to delete tasks and assignments.

-- 1. Add DELETE policy for tasks table
DROP POLICY IF EXISTS "Creators and admins can delete tasks" ON public.tasks;
CREATE POLICY "Creators and admins can delete tasks"
ON public.tasks FOR DELETE
TO authenticated
USING (
  auth.uid() = created_by OR
  has_role(auth.uid(), 'super_admin'::app_role) OR
  has_role(auth.uid(), 'organization_admin'::app_role)
);

-- 2. Add DELETE policy for task_assignments table
-- This allows task creators and admins to manage/remove specific assignments.
DROP POLICY IF EXISTS "Task creators and admins can delete assignments" ON public.task_assignments;
CREATE POLICY "Task creators and admins can delete assignments"
ON public.task_assignments FOR DELETE
TO authenticated
USING (
  is_task_creator(task_id, auth.uid()) OR
  has_role(auth.uid(), 'super_admin'::app_role) OR
  has_role(auth.uid(), 'organization_admin'::app_role)
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
