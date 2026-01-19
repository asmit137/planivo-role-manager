-- Fix RLS Policy for UPDATING vacation_plans
-- This ensures that Supervisors (Department Heads, Facility Supervisors, etc.) can update
-- the status of a vacation plan if they are authorized to approve it.

-- 1. Ensure RLS is enabled
ALTER TABLE public.vacation_plans ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing update policies to avoid conflicts (if known names exist, otherwise just add new one)
-- It's safer to drop potential conflicting policies if we know standard naming conventions, 
-- but since we don't know exact names, we will create a new distinct policy.
-- Note: If multiple policies exist, they are OR'd together, so adding a permissive one is safe.

DROP POLICY IF EXISTS "Supervisors can update vacation plans" ON public.vacation_plans;

-- 3. Create the new policy using the exist helper function
CREATE POLICY "Supervisors can update vacation plans"
ON public.vacation_plans
FOR UPDATE
TO authenticated
USING (
  public.can_approve_vacation_plan(id, auth.uid()) OR 
  staff_id = auth.uid() -- Allow staff to update their own (e.g. cancel)
)
WITH CHECK (
  public.can_approve_vacation_plan(id, auth.uid()) OR 
  staff_id = auth.uid()
);

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
