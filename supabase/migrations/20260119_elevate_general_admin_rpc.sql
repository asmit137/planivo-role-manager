CREATE OR REPLACE FUNCTION public.get_user_modules(_user_id uuid)
 RETURNS TABLE(module_id uuid, module_key text, module_name text, can_view boolean, can_edit boolean, can_delete boolean, can_admin boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_super_user boolean;
BEGIN
  -- Check if user is super_admin OR general_admin
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = _user_id 
    AND ur.role IN ('super_admin', 'general_admin')
  ) INTO is_super_user;

  IF is_super_user THEN
    RETURN QUERY 
    SELECT 
      id, key, name, 
      true as can_view, 
      true as can_edit, 
      true as can_delete, 
      true as can_admin
    FROM public.module_definitions 
    WHERE is_active = true
    ORDER BY name;
    RETURN;
  END IF;

  -- Default logic for other roles
  RETURN QUERY
  WITH user_roles_data AS (
    SELECT ur.role, ur.custom_role_id
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
$function$;
