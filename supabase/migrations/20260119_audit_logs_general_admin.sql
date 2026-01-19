-- Enable RLS on audit_logs if not already enabled (it should be)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Create a policy allowing General Admins to view audit logs
-- distinct from Super Admin policy to ensure explicit access
CREATE POLICY "General admins can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'general_admin'
  )
);
