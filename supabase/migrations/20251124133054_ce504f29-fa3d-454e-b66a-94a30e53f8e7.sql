-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM (
  'super_admin',
  'general_admin', 
  'workplace_supervisor',
  'facility_supervisor',
  'department_head',
  'staff'
);

-- ====================================
-- PROFILES TABLE (Extended User Info)
-- ====================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Everyone can read their own profile
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"  
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ====================================
-- WORKSPACES TABLE
-- ====================================
CREATE TABLE public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- ====================================
-- USER ROLES TABLE (Security-critical)
-- ====================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  facility_id UUID,
  department_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(user_id, workspace_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ====================================
-- FACILITIES TABLE (Supports Hierarchy)
-- ====================================
CREATE TABLE public.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_facility_id UUID REFERENCES public.facilities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

-- Add foreign key for facility_id in user_roles
ALTER TABLE public.user_roles 
  ADD CONSTRAINT fk_user_roles_facility 
  FOREIGN KEY (facility_id) REFERENCES public.facilities(id) ON DELETE CASCADE;

-- ====================================
-- DEPARTMENTS TABLE (Supports Hierarchy)
-- ====================================
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id UUID NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  min_staffing INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Add foreign key for department_id in user_roles
ALTER TABLE public.user_roles 
  ADD CONSTRAINT fk_user_roles_department 
  FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;

-- ====================================
-- SECURITY DEFINER FUNCTIONS
-- ====================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to check if user has role in workspace
CREATE OR REPLACE FUNCTION public.has_role_in_workspace(_user_id UUID, _role public.app_role, _workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id 
      AND role = _role 
      AND (workspace_id = _workspace_id OR workspace_id IS NULL)
  )
$$;

-- Function to get user's workspaces
CREATE OR REPLACE FUNCTION public.get_user_workspaces(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT workspace_id 
  FROM public.user_roles
  WHERE user_id = _user_id AND workspace_id IS NOT NULL
$$;

-- ====================================
-- RLS POLICIES - PROFILES
-- ====================================

-- Admins can view all profiles in their workspace
CREATE POLICY "Admins can view workspace profiles"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'general_admin', 'workplace_supervisor')
    )
  );

-- ====================================
-- RLS POLICIES - WORKSPACES
-- ====================================

-- Super admins can do everything
CREATE POLICY "Super admins can manage workspaces"
  ON public.workspaces FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Users can view their assigned workspaces
CREATE POLICY "Users can view their workspaces"
  ON public.workspaces FOR SELECT
  USING (
    id IN (SELECT public.get_user_workspaces(auth.uid()))
  );

-- ====================================
-- RLS POLICIES - USER ROLES
-- ====================================

-- Super admins can manage all roles
CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- General admins can manage roles in their workspace
CREATE POLICY "General admins can manage workspace roles"
  ON public.user_roles FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'general_admin'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'general_admin'
    )
  );

-- Users can view their own roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- ====================================
-- RLS POLICIES - FACILITIES
-- ====================================

-- Super admins and general admins can manage facilities
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

-- Users can view facilities in their workspace
CREATE POLICY "Users can view workspace facilities"
  ON public.facilities FOR SELECT
  USING (
    workspace_id IN (SELECT public.get_user_workspaces(auth.uid()))
  );

-- ====================================
-- RLS POLICIES - DEPARTMENTS
-- ====================================

-- Admins and facility supervisors can manage departments
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
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    EXISTS (
      SELECT 1 FROM public.facilities f
      JOIN public.user_roles ur ON ur.workspace_id = f.workspace_id
      WHERE f.id = departments.facility_id
        AND ur.user_id = auth.uid()
        AND ur.role IN ('general_admin', 'facility_supervisor')
    )
  );

-- Users can view departments in their workspace
CREATE POLICY "Users can view workspace departments"
  ON public.departments FOR SELECT
  USING (
    facility_id IN (
      SELECT f.id FROM public.facilities f
      WHERE f.workspace_id IN (SELECT public.get_user_workspaces(auth.uid()))
    )
  );

-- ====================================
-- TRIGGERS FOR UPDATED_AT
-- ====================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_facilities_updated_at
  BEFORE UPDATE ON public.facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();