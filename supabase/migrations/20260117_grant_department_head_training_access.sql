-- Grant department_head management access to training events they create or are responsible for

-- 1. Updates for training_events
DROP POLICY IF EXISTS "Admins can manage organization training events" ON public.training_events;
CREATE POLICY "Admins and Dept Heads can manage organization training events"
ON public.training_events
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN workspaces w ON ur.workspace_id = w.id
    WHERE ur.user_id = auth.uid()
    AND w.organization_id = training_events.organization_id
    AND (
      ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role, 'facility_supervisor'::app_role)
      OR (ur.role = 'department_head'::app_role AND training_events.created_by = auth.uid())
      OR (ur.role = 'department_head'::app_role AND training_events.responsible_user_id = auth.uid())
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    JOIN workspaces w ON ur.workspace_id = w.id
    WHERE ur.user_id = auth.uid()
    AND w.organization_id = training_events.organization_id
    AND (
      ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role, 'facility_supervisor'::app_role)
      OR (ur.role = 'department_head'::app_role AND training_events.created_by = auth.uid())
      OR (ur.role = 'department_head'::app_role AND training_events.responsible_user_id = auth.uid())
    )
  )
);

-- 2. Updates for training_event_targets
DROP POLICY IF EXISTS "Admins can manage targets for their organization events" ON public.training_event_targets;
CREATE POLICY "Admins and Dept Heads can manage targets for their organization events"
ON public.training_event_targets FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM training_events te
    JOIN workspaces w ON w.organization_id = te.organization_id
    JOIN user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_event_targets.event_id
    AND ur.user_id = auth.uid()
    AND (
      ur.role IN ('general_admin', 'workplace_supervisor', 'facility_supervisor')
      OR (ur.role = 'department_head' AND te.created_by = auth.uid())
      OR (ur.role = 'department_head' AND te.responsible_user_id = auth.uid())
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM training_events te
    JOIN workspaces w ON w.organization_id = te.organization_id
    JOIN user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_event_targets.event_id
    AND ur.user_id = auth.uid()
    AND (
      ur.role IN ('general_admin', 'workplace_supervisor', 'facility_supervisor')
      OR (ur.role = 'department_head' AND te.created_by = auth.uid())
      OR (ur.role = 'department_head' AND te.responsible_user_id = auth.uid())
    )
  )
);

-- 3. Updates for training_registrations
DROP POLICY IF EXISTS "Admins can view event registrations" ON public.training_registrations;
CREATE POLICY "Admins and Dept Heads can view event registrations"
ON public.training_registrations
FOR SELECT
USING (
  has_role(auth.uid(), 'super_admin'::app_role) OR
  EXISTS (
    SELECT 1 FROM training_events te
    JOIN workspaces w ON w.organization_id = te.organization_id
    JOIN user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_registrations.event_id
    AND ur.user_id = auth.uid()
    AND (
      ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role, 'facility_supervisor'::app_role)
      OR (ur.role = 'department_head'::app_role AND te.created_by = auth.uid())
      OR (ur.role = 'department_head'::app_role AND te.responsible_user_id = auth.uid())
    )
  )
);
