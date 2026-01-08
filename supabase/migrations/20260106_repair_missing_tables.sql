-- ================================================================
-- REPAIR SCRIPT: ENSURE ALL PERMISSION TABLES EXIST
-- ================================================================

-- 1. Create user_module_access table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.module_definitions(id) ON DELETE CASCADE,
  can_view boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  can_admin boolean DEFAULT false,
  is_override boolean DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, module_id)
);

-- 2. Enable RLS
ALTER TABLE public.user_module_access ENABLE ROW LEVEL SECURITY;

-- 3. Standard RLS Policies
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_module_access' AND policyname = 'Super admins can manage user module access') THEN
    CREATE POLICY "Super admins can manage user module access"
    ON public.user_module_access FOR ALL
    USING (has_role(auth.uid(), 'super_admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_module_access' AND policyname = 'Users can view their own module access') THEN
    CREATE POLICY "Users can view their own module access"
    ON public.user_module_access FOR SELECT
    USING (user_id = auth.uid());
  END IF;
END $$;

-- 4. Re-Verify Function (Ensure it uses the table correctly)
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
  WITH user_roles_data AS (
    SELECT ur.role, ur.custom_role_id, ur.workspace_id
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
  ),
  user_overrides AS (
    SELECT uma.module_id, uma.can_view, uma.can_edit, uma.can_delete, uma.can_admin
    FROM public.user_module_access uma
    WHERE uma.user_id = _user_id AND uma.is_override = true
  )
  SELECT DISTINCT
    md.id,
    md.key,
    md.name,
    COALESCE(uo.can_view, bool_or(rma.can_view), bool_or(crma.can_view), false) as can_view,
    COALESCE(uo.can_edit, bool_or(rma.can_edit), bool_or(crma.can_edit), false) as can_edit,
    COALESCE(uo.can_delete, bool_or(rma.can_delete), bool_or(crma.can_delete), false) as can_delete,
    COALESCE(uo.can_admin, bool_or(rma.can_admin), bool_or(crma.can_admin), false) as can_admin
  FROM public.module_definitions md
  LEFT JOIN user_overrides uo ON uo.module_id = md.id
  LEFT JOIN public.role_module_access rma ON rma.module_id = md.id 
    AND rma.role IN (SELECT role FROM user_roles_data)
  LEFT JOIN public.custom_role_module_access crma ON crma.module_id = md.id 
    AND crma.role_id IN (SELECT custom_role_id FROM user_roles_data)
  WHERE md.is_active = true
  GROUP BY md.id, md.key, md.name, uo.can_view, uo.can_edit, uo.can_delete, uo.can_admin
  HAVING COALESCE(uo.can_view, bool_or(rma.can_view), bool_or(crma.can_view), false) = true
     OR md.key = 'core'
  ORDER BY md.name;
END;
$$;

-- 5. Force Schema Reload
NOTIFY pgrst, 'reload schema';
