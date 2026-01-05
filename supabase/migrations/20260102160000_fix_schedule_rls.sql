-- Create new RLS policies for scheduling
-- Fixes issue where Super Access roles (Super Admin, General Admin, Facility Supervisor)
-- were blocked from adding shifts because policies required a departmental role match.

-- Drop existing policies
DROP POLICY IF EXISTS "Department heads can manage schedules" ON public.schedules;
DROP POLICY IF EXISTS "Users can manage shifts based on schedule access" ON public.shifts;
DROP POLICY IF EXISTS "Department heads can manage assignments" ON public.shift_assignments;

-- ==========================================
-- SCHEDULES Policies
-- ==========================================

CREATE POLICY "Manage schedules policy"
ON public.schedules FOR ALL
USING (
  -- Super Admin: Global access
  public.has_role(auth.uid(), 'super_admin')
  OR
  -- General Admin: Workspace access
  (
    public.has_role(auth.uid(), 'general_admin') 
    AND workspace_id IN (SELECT public.get_user_workspaces(auth.uid()))
  )
  OR
  -- Facility Supervisor: Facility access
  (
    public.has_role(auth.uid(), 'facility_supervisor')
    AND EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
       AND ur.role = 'facility_supervisor'
       AND ur.facility_id = schedules.facility_id
    )
  )
  OR
  -- Department Head: Department access
  (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'department_head'
      AND ur.department_id = schedules.department_id
    )
  )
)
WITH CHECK (
  -- Same checks for Write/Update
   public.has_role(auth.uid(), 'super_admin')
  OR
  (
    public.has_role(auth.uid(), 'general_admin') 
    AND workspace_id IN (SELECT public.get_user_workspaces(auth.uid()))
  )
  OR
  (
    public.has_role(auth.uid(), 'facility_supervisor')
    AND EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid()
       AND ur.role = 'facility_supervisor'
       AND ur.facility_id = schedules.facility_id
    )
  )
  OR
  (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'department_head'
      AND ur.department_id = schedules.department_id
    )
  )
);

-- ==========================================
-- SHIFTS Policies
-- ==========================================

CREATE POLICY "Manage shifts policy"
ON public.shifts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.id = shifts.schedule_id
    AND (
      -- Super Admin
      public.has_role(auth.uid(), 'super_admin')
      OR
      -- General Admin
      (
        public.has_role(auth.uid(), 'general_admin') 
        AND s.workspace_id IN (SELECT public.get_user_workspaces(auth.uid()))
      )
      OR
      -- Facility Supervisor
      (
        public.has_role(auth.uid(), 'facility_supervisor')
        AND EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
           AND ur.role = 'facility_supervisor'
           AND ur.facility_id = s.facility_id
        )
      )
      OR
      -- Department Head
      (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role = 'department_head'
          AND ur.department_id = s.department_id
        )
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.schedules s
    WHERE s.id = shifts.schedule_id
    AND (
      public.has_role(auth.uid(), 'super_admin')
      OR
      (
        public.has_role(auth.uid(), 'general_admin') 
        AND s.workspace_id IN (SELECT public.get_user_workspaces(auth.uid()))
      )
      OR
      (
        public.has_role(auth.uid(), 'facility_supervisor')
        AND EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
           AND ur.role = 'facility_supervisor'
           AND ur.facility_id = s.facility_id
        )
      )
      OR
      (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role = 'department_head'
          AND ur.department_id = s.department_id
        )
      )
    )
  )
);

-- ==========================================
-- SHIFT ASSIGNMENTS Policies
-- ==========================================

CREATE POLICY "Manage shift assignments policy"
ON public.shift_assignments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.shifts sh
    JOIN public.schedules s ON s.id = sh.schedule_id
    WHERE sh.id = shift_assignments.shift_id
    AND (
      public.has_role(auth.uid(), 'super_admin')
      OR
      (
        public.has_role(auth.uid(), 'general_admin') 
        AND s.workspace_id IN (SELECT public.get_user_workspaces(auth.uid()))
      )
      OR
      (
        public.has_role(auth.uid(), 'facility_supervisor')
        AND EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
           AND ur.role = 'facility_supervisor'
           AND ur.facility_id = s.facility_id
        )
      )
      OR
      (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role = 'department_head'
          AND ur.department_id = s.department_id
        )
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.shifts sh
    JOIN public.schedules s ON s.id = sh.schedule_id
    WHERE sh.id = shift_assignments.shift_id
    AND (
      public.has_role(auth.uid(), 'super_admin')
      OR
      (
        public.has_role(auth.uid(), 'general_admin') 
        AND s.workspace_id IN (SELECT public.get_user_workspaces(auth.uid()))
      )
      OR
      (
        public.has_role(auth.uid(), 'facility_supervisor')
        AND EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
           AND ur.role = 'facility_supervisor'
           AND ur.facility_id = s.facility_id
        )
      )
      OR
      (
        EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
          AND ur.role = 'department_head'
          AND ur.department_id = s.department_id
        )
      )
    )
  )
);
