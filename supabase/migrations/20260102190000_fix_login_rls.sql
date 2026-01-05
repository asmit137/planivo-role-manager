-- Drop the problematic policies that might cause recursion
DROP POLICY IF EXISTS "Users can view workspace roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view workspace roles" ON public.user_roles;
-- Also drop the one from the previous migration if it was named differently?
-- It was "Users can view workspace roles".

-- Ensure a basic policy for viewing own roles exists (CRITICAL for login)
-- Drop it first to be sure we don't duplicate
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;
CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

-- Restore a safer "Admins can view workspace roles" if needed, 
-- but for now, focus on fixing the crash/lockout.
-- Use a non-recursive approach or rely on the fact that super_admins might need to use the dashboard differently?
-- Actually, let's just restore the "view own role" which is minimal requirement for AuthGuard.
-- And allow super_admin to view all?
-- To avoid recursion, we can check auth.jwt() -> role? No, role is in the table.
-- We can try to use a subquery that doesn't trigger the same policy? 
-- No, RLS is always triggered.

-- Safe super admin policy (assuming super_admin role string doesn't require lookup):
-- We can't know if they are super_admin without looking up.
-- Infinite loop dilemma.
-- Standard solution: 
-- 1. Create a SECURITY DEFINER function `is_super_admin()` that queries user_roles.
--    Since it's SECURITY DEFINER, it bypasses RLS, avoiding recursion.
-- 2. Use `is_super_admin()` in the policy.

-- Let's define such a function to be safe.
CREATE OR REPLACE FUNCTION public.is_super_admin_safe()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'super_admin'
  );
$$;

-- Now use it in a policy for super admins to view everything
CREATE POLICY "Super Check"
ON public.user_roles FOR SELECT
USING (
  user_id = auth.uid() -- View own
  OR
  is_super_admin_safe() -- View all if super admin
);

-- Note: "Users can view own role" is redundant if we use the combined one above, 
-- but keeping them separate is fine too (OR logic).
-- Let's stick to the combined "Super Check" or just separate them for clarity.
DROP POLICY IF EXISTS "Users can view own role" ON public.user_roles;

CREATE POLICY "Users can view own role"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Super admins can view all roles"
ON public.user_roles FOR SELECT
USING (is_super_admin_safe());

-- What about workspace admins viewing their staff?
-- Use a similar SECURITY DEFINER function or careful join?
-- For now, user just wants "No Role Assigned" fixed (login). restoring basic visibility is key.
-- The previous code tried to let workspace users view each other. 
-- We can re-add that later safely.
