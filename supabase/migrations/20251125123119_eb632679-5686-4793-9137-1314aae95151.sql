-- Create module definitions table
CREATE TABLE IF NOT EXISTS public.module_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  is_active BOOLEAN DEFAULT true,
  depends_on TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create role-based module access table
CREATE TABLE IF NOT EXISTS public.role_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL,
  module_id UUID REFERENCES public.module_definitions(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, module_id)
);

-- Create workspace-specific module overrides table
CREATE TABLE IF NOT EXISTS public.workspace_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  module_id UUID REFERENCES public.module_definitions(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(workspace_id, module_id)
);

-- Enable RLS
ALTER TABLE public.module_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_module_access ENABLE ROW LEVEL SECURITY;

-- RLS Policies for module_definitions
CREATE POLICY "All authenticated users can view modules"
  ON public.module_definitions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage modules"
  ON public.module_definitions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- RLS Policies for role_module_access
CREATE POLICY "All authenticated users can view role module access"
  ON public.role_module_access FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage role module access"
  ON public.role_module_access FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- RLS Policies for workspace_module_access
CREATE POLICY "Users can view workspace module access"
  ON public.workspace_module_access FOR SELECT
  TO authenticated
  USING (workspace_id IN (SELECT get_user_workspaces(auth.uid())));

CREATE POLICY "Admins can manage workspace module access"
  ON public.workspace_module_access FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin') OR 
    has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin') OR 
    has_role_in_workspace(auth.uid(), 'general_admin', workspace_id)
  );

-- Helper function: Check if user has access to a specific module
CREATE OR REPLACE FUNCTION public.has_module_access(_user_id uuid, _module_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  module_id_var uuid;
  user_role_var app_role;
  has_access boolean := false;
BEGIN
  -- Get the module ID
  SELECT id INTO module_id_var
  FROM public.module_definitions
  WHERE key = _module_key AND is_active = true;
  
  IF module_id_var IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if user has any role with access to this module
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_module_access rma ON rma.role = ur.role
    WHERE ur.user_id = _user_id
      AND rma.module_id = module_id_var
      AND rma.can_view = true
  ) INTO has_access;
  
  RETURN has_access;
END;
$$;

-- Helper function: Get all modules a user has access to
CREATE OR REPLACE FUNCTION public.get_user_modules(_user_id uuid)
RETURNS TABLE (
  module_id uuid,
  module_key text,
  module_name text,
  can_view boolean,
  can_edit boolean,
  can_delete boolean,
  can_admin boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    md.id,
    md.key,
    md.name,
    bool_or(rma.can_view) as can_view,
    bool_or(rma.can_edit) as can_edit,
    bool_or(rma.can_delete) as can_delete,
    bool_or(rma.can_admin) as can_admin
  FROM public.module_definitions md
  JOIN public.role_module_access rma ON rma.module_id = md.id
  JOIN public.user_roles ur ON ur.role = rma.role
  WHERE ur.user_id = _user_id
    AND md.is_active = true
  GROUP BY md.id, md.key, md.name
  ORDER BY md.name;
END;
$$;

-- Seed default modules
INSERT INTO public.module_definitions (name, key, description, icon, is_active, depends_on) VALUES
  ('Core System', 'core', 'Authentication, Profile, and Session Management', 'Lock', true, '{}'),
  ('User Management', 'user_management', 'Create, edit, and manage users and roles', 'Users', true, '{core}'),
  ('Organization Structure', 'organization', 'Manage workspaces, facilities, departments, and categories', 'Building2', true, '{core}'),
  ('Staff Management', 'staff_management', 'Department Head staff management and specialty assignment', 'UserCog', true, '{core,organization}'),
  ('Vacation Planning', 'vacation_planning', 'Create, approve, and manage vacation plans with conflict detection', 'Calendar', true, '{core,organization,staff_management}'),
  ('Task Management', 'task_management', 'Create, assign, and track tasks across the organization', 'CheckSquare', true, '{core,organization}'),
  ('Messaging', 'messaging', 'Internal messaging and communication system', 'MessageSquare', true, '{core}'),
  ('Notifications', 'notifications', 'System notifications and alerts', 'Bell', true, '{core}')
ON CONFLICT (key) DO NOTHING;

-- Seed default role module access
-- Super Admin: Full access to everything
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 
  'super_admin'::app_role,
  id,
  true,
  true,
  true,
  true
FROM public.module_definitions
ON CONFLICT (role, module_id) DO NOTHING;

-- General Admin: Access to user management, organization, vacation, tasks
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 
  'general_admin'::app_role,
  id,
  true,
  true,
  CASE WHEN key IN ('user_management', 'organization') THEN true ELSE false END,
  false
FROM public.module_definitions
WHERE key IN ('core', 'user_management', 'organization', 'vacation_planning', 'task_management', 'messaging', 'notifications')
ON CONFLICT (role, module_id) DO NOTHING;

-- Workplace Supervisor: Tasks, vacation, messaging, notifications
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 
  'workplace_supervisor'::app_role,
  id,
  true,
  CASE WHEN key IN ('task_management', 'vacation_planning') THEN true ELSE false END,
  false,
  false
FROM public.module_definitions
WHERE key IN ('core', 'task_management', 'vacation_planning', 'messaging', 'notifications')
ON CONFLICT (role, module_id) DO NOTHING;

-- Facility Supervisor: Tasks, vacation, messaging, notifications
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 
  'facility_supervisor'::app_role,
  id,
  true,
  CASE WHEN key IN ('task_management', 'vacation_planning') THEN true ELSE false END,
  false,
  false
FROM public.module_definitions
WHERE key IN ('core', 'task_management', 'vacation_planning', 'messaging', 'notifications')
ON CONFLICT (role, module_id) DO NOTHING;

-- Department Head: Staff management, vacation, tasks, messaging, notifications
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 
  'department_head'::app_role,
  id,
  true,
  CASE WHEN key IN ('staff_management', 'vacation_planning', 'task_management') THEN true ELSE false END,
  false,
  false
FROM public.module_definitions
WHERE key IN ('core', 'staff_management', 'vacation_planning', 'task_management', 'messaging', 'notifications')
ON CONFLICT (role, module_id) DO NOTHING;

-- Staff: Tasks (view), vacation (view), messaging, notifications
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 
  'staff'::app_role,
  id,
  true,
  CASE WHEN key IN ('messaging') THEN true ELSE false END,
  false,
  false
FROM public.module_definitions
WHERE key IN ('core', 'task_management', 'vacation_planning', 'messaging', 'notifications')
ON CONFLICT (role, module_id) DO NOTHING;

-- Add trigger for updated_at on module_definitions
CREATE TRIGGER update_module_definitions_updated_at
  BEFORE UPDATE ON public.module_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();