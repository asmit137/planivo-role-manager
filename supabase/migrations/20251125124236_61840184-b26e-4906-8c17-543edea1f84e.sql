-- Update get_user_modules to consider workspace-level overrides
CREATE OR REPLACE FUNCTION public.get_user_modules(_user_id uuid)
RETURNS TABLE(
  module_id uuid,
  module_key text,
  module_name text,
  can_view boolean,
  can_edit boolean,
  can_delete boolean,
  can_admin boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  LEFT JOIN public.workspace_module_access wma ON wma.module_id = md.id AND wma.workspace_id = ur.workspace_id
  WHERE ur.user_id = _user_id
    AND md.is_active = true
    AND (wma.id IS NULL OR wma.is_enabled = true)
  GROUP BY md.id, md.key, md.name
  ORDER BY md.name;
END;
$function$;