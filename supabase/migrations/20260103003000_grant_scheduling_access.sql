-- Grant scheduling module access to workplace_supervisor, facility_supervisor, and general_admin
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'workplace_supervisor'::app_role, id, true, true, false, false
FROM public.module_definitions WHERE key = 'scheduling'
ON CONFLICT (role, module_id) DO UPDATE SET can_view = true, can_edit = true;

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'facility_supervisor'::app_role, id, true, true, false, false
FROM public.module_definitions WHERE key = 'scheduling'
ON CONFLICT (role, module_id) DO UPDATE SET can_view = true, can_edit = true;

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'general_admin'::app_role, id, true, true, false, false
FROM public.module_definitions WHERE key = 'scheduling'
ON CONFLICT (role, module_id) DO UPDATE SET can_view = true, can_edit = true;
