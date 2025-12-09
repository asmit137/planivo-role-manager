-- Add policy for admins/coordinators to insert attendance for other users (manual check-in)
CREATE POLICY "Event coordinators can insert attendance for others"
ON public.training_attendance
FOR INSERT
WITH CHECK (
  -- User inserting their own attendance
  (user_id = auth.uid())
  OR
  -- Super admin can insert any attendance
  has_role(auth.uid(), 'super_admin'::app_role)
  OR
  -- Event coordinator (responsible_user) can insert attendance for their event
  EXISTS (
    SELECT 1 FROM public.training_events te
    WHERE te.id = training_attendance.event_id
    AND te.responsible_user_id = auth.uid()
  )
  OR
  -- Admins in the organization can insert attendance
  EXISTS (
    SELECT 1 FROM public.training_events te
    JOIN public.workspaces w ON w.organization_id = te.organization_id
    JOIN public.user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_attendance.event_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('general_admin', 'workplace_supervisor', 'facility_supervisor')
  )
);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can insert their own attendance" ON public.training_attendance;