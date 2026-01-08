-- ================================================================
-- FAIL-PROOF REPAIR SCRIPT (Sidebar Restoration)
-- ================================================================

-- 1. REPAIR MISSING COLUMNS
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='force_password_change') THEN
    ALTER TABLE public.profiles ADD COLUMN force_password_change BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_roles' AND column_name='specialty_id') THEN
    ALTER TABLE public.user_roles ADD COLUMN specialty_id UUID;
  END IF;
END $$;

-- 2. RECREATE CORE FUNCTIONS (DUAL ENDPOINT FOR MAX COMPATIBILITY)
-- We define both to ensure whatever the frontend calls, it works.

DROP FUNCTION IF EXISTS public.get_user_modules(uuid);
DROP FUNCTION IF EXISTS public.get_user_modules();
DROP FUNCTION IF EXISTS public.get_my_modules();

-- Function A: The parameter-based one
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

-- Function B: The parameterless one (Easier for PostgREST to find)
CREATE OR REPLACE FUNCTION public.get_my_modules()
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
  RETURN QUERY SELECT * FROM public.get_user_modules(auth.uid());
END;
$$;

-- 3. GRANT ALL PERMISSIONS
GRANT EXECUTE ON FUNCTION public.get_user_modules(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_modules() TO authenticated, anon, service_role;

-- 4. FORCE REFRESH
NOTIFY pgrst, 'reload schema';

-- Verification output
SELECT 'Repair Successful' as status, 
       (SELECT count(*) FROM public.module_definitions) as total_modules;
