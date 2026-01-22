-- Allow assignees to update task status
DROP POLICY IF EXISTS "Task creators can update their tasks" ON tasks;
DROP POLICY IF EXISTS "Creators and assignees can update tasks" ON tasks;

CREATE POLICY "Creators and assignees can update tasks"
ON tasks
FOR UPDATE
TO authenticated
USING (
    (created_by = auth.uid()) OR 
    is_task_assignee(id, auth.uid()) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'organization_admin'::app_role)
)
WITH CHECK (
    (created_by = auth.uid()) OR 
    is_task_assignee(id, auth.uid()) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'organization_admin'::app_role)
);
