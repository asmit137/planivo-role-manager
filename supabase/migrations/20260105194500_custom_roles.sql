-- Migration: Custom Roles and Permissions
-- Description: Adds tables for dynamic custom roles and integrates them into the module access system.

-- 1. Create custom_roles table
CREATE TABLE IF NOT EXISTS public.custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create custom_role_module_access table
CREATE TABLE IF NOT EXISTS public.custom_role_module_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES public.custom_roles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.module_definitions(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT false,
  can_edit BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  can_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role_id, module_id)
);

-- 3. Add custom_role_id to user_roles table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_roles' AND column_name = 'custom_role_id') THEN
    ALTER TABLE public.user_roles ADD COLUMN custom_role_id UUID REFERENCES public.custom_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4. Enable RLS on new tables
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_role_module_access ENABLE ROW LEVEL SECURITY;

-- 5. Policies for custom_roles
CREATE POLICY "Super admins can manage custom roles"
ON public.custom_roles
FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role));

CREATE POLICY "Authenticated users can view custom roles"
ON public.custom_roles
FOR SELECT
USING (auth.role() = 'authenticated');

-- 6. Policies for custom_role_module_access
CREATE POLICY "Super admins can manage custom role permissions"
ON public.custom_role_module_access
FOR ALL
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin'::app_role));

CREATE POLICY "Authenticated users can view custom role permissions"
ON public.custom_role_module_access
FOR SELECT
USING (auth.role() = 'authenticated');

-- 7. Update get_user_modules function to include custom role permissions
CREATE OR REPLACE FUNCTION public.get_user_modules(_user_id uuid)
RETURNS TABLE(module_id uuid, module_key text, module_name text, can_view boolean, can_edit boolean, can_delete boolean, can_admin boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH user_roles_data AS (
    -- Get current user's roles (enum and custom)
    SELECT 
      ur.role as enum_role,
      ur.custom_role_id,
      ur.workspace_id
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
  ),
  user_overrides AS (
    -- Get user-specific overrides (highest priority)
    SELECT 
      uma.module_id,
      uma.can_view,
      uma.can_edit,
      uma.can_delete,
      uma.can_admin
    FROM public.user_module_access uma
    WHERE uma.user_id = _user_id AND uma.is_override = true
  ),
  enum_role_permissions AS (
    -- Get permissions for standard enum roles
    SELECT 
      rma.module_id,
      rma.can_view,
      rma.can_edit,
      rma.can_delete,
      rma.can_admin,
      urd.workspace_id
    FROM public.role_module_access rma
    JOIN user_roles_data urd ON urd.enum_role = rma.role
  ),
  custom_role_permissions AS (
    -- Get permissions for custom roles
    SELECT 
      crma.module_id,
      crma.can_view,
      crma.can_edit,
      crma.can_delete,
      crma.can_admin,
      urd.workspace_id
    FROM public.custom_role_module_access crma
    JOIN user_roles_data urd ON urd.custom_role_id = crma.role_id
  ),
  combined_role_permissions AS (
    -- Combine enum and custom role permissions
    SELECT 
      cp.module_id,
      bool_or(cp.can_view) as can_view,
      bool_or(cp.can_edit) as can_edit,
      bool_or(cp.can_delete) as can_delete,
      bool_or(cp.can_admin) as can_admin
    FROM (
      SELECT module_id, can_view, can_edit, can_delete, can_admin, workspace_id FROM enum_role_permissions
      UNION ALL
      SELECT module_id, can_view, can_edit, can_delete, can_admin, workspace_id FROM custom_role_permissions
    ) cp
    LEFT JOIN public.workspace_module_access wma ON wma.module_id = cp.module_id AND wma.workspace_id = cp.workspace_id
    WHERE (wma.id IS NULL OR wma.is_enabled = true)
    GROUP BY cp.module_id
  )
  SELECT DISTINCT
    md.id,
    md.key,
    md.name,
    COALESCE(uo.can_view, crp.can_view, false) as can_view,
    COALESCE(uo.can_edit, crp.can_edit, false) as can_edit,
    COALESCE(uo.can_delete, crp.can_delete, false) as can_delete,
    COALESCE(uo.can_admin, crp.can_admin, false) as can_admin
  FROM public.module_definitions md
  LEFT JOIN user_overrides uo ON uo.module_id = md.id
  LEFT JOIN combined_role_permissions crp ON crp.module_id = md.id
  WHERE md.is_active = true
    AND (uo.module_id IS NOT NULL OR crp.module_id IS NOT NULL)
  ORDER BY md.name;
END;
$function$;
