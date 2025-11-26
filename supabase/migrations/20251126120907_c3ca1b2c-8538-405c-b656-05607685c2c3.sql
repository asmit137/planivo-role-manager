-- Add RLS policy allowing Department Heads to update staff profiles in their department
CREATE POLICY "Department heads can update staff profiles in their department" 
ON public.profiles
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 
    FROM public.user_roles dh
    JOIN public.user_roles staff ON staff.user_id = profiles.id
    WHERE dh.user_id = auth.uid()
      AND dh.role = 'department_head'
      AND staff.role = 'staff'
      AND dh.department_id = staff.department_id
  )
);