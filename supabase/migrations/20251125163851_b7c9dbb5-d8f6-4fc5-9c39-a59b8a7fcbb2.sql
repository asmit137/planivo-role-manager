-- Update vacation_plans RLS policy to allow Department Heads to submit plans for their department
DROP POLICY IF EXISTS "Plan creators can update draft plans" ON public.vacation_plans;

CREATE POLICY "Plan creators and department heads can update draft plans" ON public.vacation_plans
FOR UPDATE USING (
  (status = 'draft') AND (
    created_by = auth.uid() 
    OR EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND role = 'department_head' 
      AND department_id = vacation_plans.department_id
    )
  )
);