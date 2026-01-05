-- STEP 3: SECURITY POLICIES (RLS)

-- Profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view workspace profiles" ON public.profiles;
CREATE POLICY "Admins can view workspace profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'general_admin', 'workplace_supervisor')
    )
  );

-- Workspaces
DROP POLICY IF EXISTS "Super admins can manage workspaces" ON public.workspaces;
CREATE POLICY "Super admins can manage workspaces"
  ON public.workspaces FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;
CREATE POLICY "Users can view their workspaces"
  ON public.workspaces FOR SELECT
  USING (id IN (SELECT public.get_user_workspaces(auth.uid())));

-- User Roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage all roles" ON public.user_roles;
CREATE POLICY "Service role can manage all roles"
  ON public.user_roles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Facilities & Departments
DROP POLICY IF EXISTS "Admins can manage facilities" ON public.facilities;
CREATE POLICY "Admins can manage facilities"
  ON public.facilities FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

DROP POLICY IF EXISTS "Users can view workspace facilities" ON public.facilities;
CREATE POLICY "Users can view workspace facilities"
  ON public.facilities FOR SELECT
  USING (workspace_id IN (SELECT public.get_user_workspaces(auth.uid())));

DROP POLICY IF EXISTS "Admins can manage departments" ON public.departments;
CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.facilities f
      JOIN public.user_roles ur ON ur.workspace_id = f.workspace_id
      WHERE f.id = departments.facility_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('general_admin', 'facility_supervisor')
    )
  );
