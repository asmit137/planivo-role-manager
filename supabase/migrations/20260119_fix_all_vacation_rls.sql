-- Fix RLS Policies for vacation_splits and vacation_approvals
-- Ensures supervisors can update splits and create approval records.

-- A. VACATION SPLITS
ALTER TABLE public.vacation_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors can update vacation splits" ON public.vacation_splits;

CREATE POLICY "Supervisors can update vacation splits"
ON public.vacation_splits
FOR UPDATE
TO authenticated
USING (
  -- Check if the user can approve the PARENT vacation plan
  EXISTS (
    SELECT 1 FROM public.vacation_plans vp 
    WHERE vp.id = vacation_splits.vacation_plan_id 
    AND (
      public.can_approve_vacation_plan(vp.id, auth.uid()) OR 
      vp.staff_id = auth.uid()
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vacation_plans vp 
    WHERE vp.id = vacation_splits.vacation_plan_id 
    AND (
      public.can_approve_vacation_plan(vp.id, auth.uid()) OR 
      vp.staff_id = auth.uid()
    )
  )
);

-- B. VACATION APPROVALS
ALTER TABLE public.vacation_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors can insert approvals" ON public.vacation_approvals;
DROP POLICY IF EXISTS "Supervisors can update approvals" ON public.vacation_approvals;

CREATE POLICY "Supervisors can insert approvals"
ON public.vacation_approvals
FOR INSERT
TO authenticated
WITH CHECK (
  -- Can approve the related plan
  public.can_approve_vacation_plan(vacation_plan_id, auth.uid())
);

CREATE POLICY "Supervisors can update approvals"
ON public.vacation_approvals
FOR UPDATE
TO authenticated
USING (
  approver_id = auth.uid() OR -- Can update their own approval
  public.can_approve_vacation_plan(vacation_plan_id, auth.uid())
)
WITH CHECK (
  approver_id = auth.uid() OR
  public.can_approve_vacation_plan(vacation_plan_id, auth.uid())
);

-- C. VACATION PLANS (Reinforcing SELECT policy just in case)
-- Ensure supervisors can SEE the plans they need to approve
DROP POLICY IF EXISTS "Supervisors can view pending plans" ON public.vacation_plans;
CREATE POLICY "Supervisors can view pending plans"
ON public.vacation_plans
FOR SELECT
TO authenticated
USING (
  staff_id = auth.uid() OR
  public.can_approve_vacation_plan(id, auth.uid()) OR
  auth_is_admin() -- fallback for super admins
);

NOTIFY pgrst, 'reload schema';
