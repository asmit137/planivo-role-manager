-- Phase 1: Fix Critical RLS Issues

-- 1. Fix Facility Supervisor vacation_plans SELECT policy (incorrect department_id logic)
DROP POLICY IF EXISTS "Users can view plans in their scope" ON public.vacation_plans;

CREATE POLICY "Users can view plans in their scope" 
ON public.vacation_plans 
FOR SELECT 
USING (
  (staff_id = auth.uid()) 
  OR (created_by = auth.uid()) 
  OR (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND (
      -- Super admin sees all
      (ur.role = 'super_admin') 
      -- Workplace supervisor sees all in their workspace
      OR (ur.role = 'workplace_supervisor' AND ur.workspace_id IN (
        SELECT f.workspace_id FROM facilities f 
        JOIN departments d ON d.facility_id = f.id 
        WHERE d.id = vacation_plans.department_id
      ))
      -- Facility supervisor sees all in their facility (FIXED: was using ur.department_id incorrectly)
      OR (ur.role = 'facility_supervisor' AND ur.facility_id IN (
        SELECT d.facility_id FROM departments d 
        WHERE d.id = vacation_plans.department_id
      ))
      -- Department head sees their department
      OR (ur.role = 'department_head' AND ur.department_id = vacation_plans.department_id)
    )
  ))
);

-- 2. Fix vacation_splits RLS - Add approver permissions
DROP POLICY IF EXISTS "Splits inherit vacation_plan permissions" ON public.vacation_splits;

-- Owners can manage their splits
CREATE POLICY "Owners can manage their splits" 
ON public.vacation_splits 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM vacation_plans vp
    WHERE vp.id = vacation_splits.vacation_plan_id 
    AND (vp.created_by = auth.uid() OR vp.staff_id = auth.uid())
  )
);

-- Approvers can view and update splits
CREATE POLICY "Approvers can view splits" 
ON public.vacation_splits 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM vacation_plans vp
    JOIN departments d ON d.id = vp.department_id
    JOIN user_roles ur ON ur.user_id = auth.uid()
    WHERE vp.id = vacation_splits.vacation_plan_id 
    AND (
      ur.role = 'super_admin'
      OR (ur.role = 'department_head' AND ur.department_id = vp.department_id)
      OR (ur.role = 'facility_supervisor' AND ur.facility_id = d.facility_id)
      OR (ur.role = 'workplace_supervisor' AND ur.workspace_id IN (
        SELECT f.workspace_id FROM facilities f WHERE f.id = d.facility_id
      ))
    )
  )
);

CREATE POLICY "Approvers can update splits" 
ON public.vacation_splits 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM vacation_plans vp
    JOIN departments d ON d.id = vp.department_id
    JOIN user_roles ur ON ur.user_id = auth.uid()
    WHERE vp.id = vacation_splits.vacation_plan_id 
    AND (
      ur.role = 'super_admin'
      OR (ur.role = 'department_head' AND ur.department_id = vp.department_id AND vp.status = 'department_pending')
      OR (ur.role = 'facility_supervisor' AND ur.facility_id = d.facility_id AND vp.status = 'facility_pending')
      OR (ur.role = 'workplace_supervisor' AND ur.workspace_id IN (
        SELECT f.workspace_id FROM facilities f WHERE f.id = d.facility_id
      ) AND vp.status = 'workspace_pending')
    )
  )
);

-- Phase 2: Fix vacation_approvals RLS

-- Drop existing policies if any
DROP POLICY IF EXISTS "Users can view their own approvals" ON public.vacation_approvals;
DROP POLICY IF EXISTS "Users can create approvals" ON public.vacation_approvals;
DROP POLICY IF EXISTS "Users can update their approvals" ON public.vacation_approvals;

-- Approvers can view all approvals for plans in their scope
CREATE POLICY "Approvers can view approvals in scope" 
ON public.vacation_approvals 
FOR SELECT 
USING (
  -- User is the approver
  approver_id = auth.uid()
  -- Or user has supervisor role with visibility
  OR EXISTS (
    SELECT 1 FROM vacation_plans vp
    JOIN departments d ON d.id = vp.department_id
    JOIN user_roles ur ON ur.user_id = auth.uid()
    WHERE vp.id = vacation_approvals.vacation_plan_id 
    AND (
      ur.role = 'super_admin'
      OR (ur.role = 'department_head' AND ur.department_id = vp.department_id)
      OR (ur.role = 'facility_supervisor' AND ur.facility_id = d.facility_id)
      OR (ur.role = 'workplace_supervisor' AND ur.workspace_id IN (
        SELECT f.workspace_id FROM facilities f WHERE f.id = d.facility_id
      ))
    )
  )
  -- Or user owns the vacation plan
  OR EXISTS (
    SELECT 1 FROM vacation_plans vp 
    WHERE vp.id = vacation_approvals.vacation_plan_id 
    AND (vp.staff_id = auth.uid() OR vp.created_by = auth.uid())
  )
);

-- Approvers can create approvals for plans they're responsible for
CREATE POLICY "Approvers can create approvals" 
ON public.vacation_approvals 
FOR INSERT 
WITH CHECK (
  approver_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM vacation_plans vp
    JOIN departments d ON d.id = vp.department_id
    JOIN user_roles ur ON ur.user_id = auth.uid()
    WHERE vp.id = vacation_approvals.vacation_plan_id 
    AND (
      ur.role = 'super_admin'
      OR (ur.role = 'department_head' AND ur.department_id = vp.department_id AND vp.status = 'department_pending')
      OR (ur.role = 'facility_supervisor' AND ur.facility_id = d.facility_id AND vp.status = 'facility_pending')
      OR (ur.role = 'workplace_supervisor' AND ur.workspace_id IN (
        SELECT f.workspace_id FROM facilities f WHERE f.id = d.facility_id
      ) AND vp.status = 'workspace_pending')
    )
  )
);

-- Approvers can update their own approvals
CREATE POLICY "Approvers can update their approvals" 
ON public.vacation_approvals 
FOR UPDATE 
USING (approver_id = auth.uid());

-- Phase 3: Enable realtime on vacation_approvals
ALTER PUBLICATION supabase_realtime ADD TABLE public.vacation_approvals;

-- Set replica identity for realtime
ALTER TABLE public.vacation_approvals REPLICA IDENTITY FULL;