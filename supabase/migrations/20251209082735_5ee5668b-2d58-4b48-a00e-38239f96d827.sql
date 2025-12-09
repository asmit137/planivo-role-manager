-- Add UPDATE policy for admins/coordinators to update attendance
DROP POLICY IF EXISTS "Event coordinators can update attendance" ON public.training_attendance;

CREATE POLICY "Admins can update attendance"
ON public.training_attendance
FOR UPDATE
USING (
  -- User updating their own attendance
  (user_id = auth.uid())
  OR
  -- Super admin can update any attendance
  has_role(auth.uid(), 'super_admin'::app_role)
  OR
  -- Event coordinator (responsible_user) can update attendance for their event
  EXISTS (
    SELECT 1 FROM public.training_events te
    WHERE te.id = training_attendance.event_id
    AND te.responsible_user_id = auth.uid()
  )
  OR
  -- Admins in the organization can update attendance
  EXISTS (
    SELECT 1 FROM public.training_events te
    JOIN public.workspaces w ON w.organization_id = te.organization_id
    JOIN public.user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_attendance.event_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('general_admin', 'workplace_supervisor', 'facility_supervisor')
  )
);