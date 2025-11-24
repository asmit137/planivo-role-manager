-- Update RLS policies to allow staff to create their own vacation plans
DROP POLICY IF EXISTS "Department heads can create plans for their department" ON public.vacation_plans;

-- Staff can create plans for themselves OR Department Heads can create for their staff
CREATE POLICY "Staff and Department Heads can create vacation plans"
ON public.vacation_plans
FOR INSERT
TO authenticated
WITH CHECK (
  -- Staff creating their own plan
  (auth.uid() = staff_id AND auth.uid() = created_by)
  OR
  -- Department Head creating plan for their staff
  (auth.uid() = created_by AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'department_head'
    AND ur.department_id = vacation_plans.department_id
  ))
);