-- Allow super admins to insert and delete user_roles
DROP POLICY IF EXISTS "Super admins can manage user roles" ON public.user_roles;

CREATE POLICY "Super admins can manage user roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'super_admin'
  )
);