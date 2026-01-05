-- =====================================================
-- FIX: Task Assignment Visibility for Admins
-- =====================================================
-- This script updates RLS policies for task_assignments
-- to allow super_admin and organization_admin to view
-- all task assignments across the organization.

DROP POLICY IF EXISTS "Users can view their assignments" ON public.task_assignments;

CREATE POLICY "Users can view their assignments"
ON public.task_assignments FOR SELECT
USING (
  assigned_to = auth.uid() OR
  is_task_creator(task_id, auth.uid()) OR
  has_role(auth.uid(), 'super_admin'::app_role) OR
  has_role(auth.uid(), 'organization_admin'::app_role)
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
