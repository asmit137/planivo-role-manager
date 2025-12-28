-- =====================================================
-- CRITICAL SECURITY FIX: Tasks INSERT Policy Bug
-- =====================================================
-- The current policy has a self-referential logic bug:
-- ur.workspace_id = ur.workspace_id (always true)
-- instead of: ur.workspace_id = tasks.workspace_id
-- =====================================================

-- Drop the buggy policy
DROP POLICY IF EXISTS "Users can create tasks based on role" ON public.tasks;

-- Create the fixed policy with correct scope validation
CREATE POLICY "Users can create tasks based on role" 
ON public.tasks 
FOR INSERT 
TO authenticated
WITH CHECK (
  (auth.uid() = created_by) AND 
  (
    -- Super admins can create any task
    has_role(auth.uid(), 'super_admin'::app_role)
    OR
    -- Workplace supervisors can create workspace-scoped tasks in their workspace
    (
      scope_type = 'workspace' AND 
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() 
          AND ur.role = 'workplace_supervisor'::app_role 
          AND ur.workspace_id = tasks.workspace_id
      )
    )
    OR
    -- Facility supervisors can create facility-scoped tasks in their facility
    (
      scope_type = 'facility' AND 
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() 
          AND ur.role = 'facility_supervisor'::app_role 
          AND ur.facility_id = tasks.facility_id
      )
    )
    OR
    -- Department heads can create department-scoped tasks in their department
    (
      scope_type = 'department' AND 
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() 
          AND ur.role = 'department_head'::app_role 
          AND ur.department_id = tasks.department_id
      )
    )
  )
);

-- =====================================================
-- CRITICAL SECURITY FIX: vacation_plans UPDATE Policy
-- =====================================================
-- Current policy has WITH CHECK (true) which allows
-- arbitrary updates after initial USING check passes
-- =====================================================

-- Drop the buggy policy
DROP POLICY IF EXISTS "Users can update vacation plans based on role and status" ON public.vacation_plans;

-- Create fixed policy with proper WITH CHECK validation
CREATE POLICY "Users can update vacation plans based on role and status" 
ON public.vacation_plans 
FOR UPDATE 
TO authenticated
USING (
  -- Draft plans: owner/creator can update
  ((status = 'draft') AND ((created_by = auth.uid()) OR (staff_id = auth.uid())))
  OR
  -- Draft plans: department head can update
  ((status = 'draft') AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'department_head'::app_role 
      AND ur.department_id = vacation_plans.department_id
  ))
  OR
  -- Department pending: department head can update
  ((status = 'department_pending') AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'department_head'::app_role 
      AND ur.department_id = vacation_plans.department_id
  ))
  OR
  -- Facility pending: facility supervisor can update
  ((status = 'facility_pending') AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.departments d ON d.id = vacation_plans.department_id
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'facility_supervisor'::app_role 
      AND ur.facility_id = d.facility_id
  ))
  OR
  -- Workspace pending: workplace supervisor can update
  ((status = 'workspace_pending') AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.departments d ON d.id = vacation_plans.department_id
    JOIN public.facilities f ON f.id = d.facility_id
    WHERE ur.user_id = auth.uid() 
      AND ur.role = 'workplace_supervisor'::app_role 
      AND ur.workspace_id = f.workspace_id
  ))
  OR
  -- Super admin can update any
  has_role(auth.uid(), 'super_admin'::app_role)
)
WITH CHECK (
  -- Validate status transitions are legitimate
  -- Draft can go to: department_pending, cancelled
  -- Department pending can go to: facility_pending, rejected, draft
  -- Facility pending can go to: workspace_pending, rejected, department_pending
  -- Workspace pending can go to: approved, rejected, facility_pending
  
  -- Owners can only update draft plans to department_pending or cancelled
  (
    ((created_by = auth.uid()) OR (staff_id = auth.uid())) AND
    (status IN ('draft', 'department_pending', 'cancelled'))
  )
  OR
  -- Department heads can set: facility_pending, rejected, draft
  (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'department_head'::app_role 
        AND ur.department_id = vacation_plans.department_id
    ) AND
    (status IN ('draft', 'department_pending', 'facility_pending', 'rejected'))
  )
  OR
  -- Facility supervisors can set: workspace_pending, rejected, department_pending
  (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.departments d ON d.id = vacation_plans.department_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'facility_supervisor'::app_role 
        AND ur.facility_id = d.facility_id
    ) AND
    (status IN ('facility_pending', 'workspace_pending', 'rejected', 'department_pending'))
  )
  OR
  -- Workplace supervisors can set: approved, rejected, facility_pending
  (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.departments d ON d.id = vacation_plans.department_id
      JOIN public.facilities f ON f.id = d.facility_id
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'workplace_supervisor'::app_role 
        AND ur.workspace_id = f.workspace_id
    ) AND
    (status IN ('workspace_pending', 'approved', 'rejected', 'facility_pending'))
  )
  OR
  -- Super admin can set any status
  has_role(auth.uid(), 'super_admin'::app_role)
);