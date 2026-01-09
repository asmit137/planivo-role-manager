-- =====================================================
-- DEFINITIVE FIX: RLS Recursion (The "No Subquery" Rule)
-- =====================================================
-- Direct subqueries on the same table inside a policy 
-- cause infinite recursion. We must use SECURITY DEFINER 
-- functions for ALL role-based checks.

-- 1. Reset user_roles policies
ALTER TABLE public.user_roles DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_read_policy" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Supervisors can view other roles" ON public.user_roles;
DROP POLICY IF EXISTS "General admins can manage workspace roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SEPARATION: Use simple SELECT policy, and mutation policy that uses function
CREATE POLICY "user_roles_select_v2"
ON public.user_roles FOR SELECT
TO authenticated
USING (true);

-- CRITICAL: This policy must use hasn_role() (SECURITY DEFINER) 
-- instead of a direct subquery to avoid recursion.
CREATE POLICY "user_roles_admin_v2"
ON public.user_roles FOR ALL
TO authenticated
USING (
  user_id = auth.uid() OR 
  public.has_role(auth.uid(), 'super_admin') OR 
  public.has_role(auth.uid(), 'organization_admin')
);

-- 2. Update has_role to be even more robust
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- This query runs as 'postgres' and BYPASSES RLS, breaking the loop
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 3. Clean up Profiles recursion
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "profiles_select_v2"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- 4. Clean up Vacation Plans recursion
-- Ensure the SELECT policy is simple or uses the security definer function
DROP POLICY IF EXISTS "Supervisors and staff can view vacation plans" ON public.vacation_plans;
CREATE POLICY "vacation_plans_select_v2"
ON public.vacation_plans FOR SELECT
TO authenticated
USING (
  staff_id = auth.uid() OR 
  created_by = auth.uid() OR 
  public.check_vacation_access(staff_id, department_id, auth.uid())
);

-- Notify schema change
NOTIFY pgrst, 'reload schema';
