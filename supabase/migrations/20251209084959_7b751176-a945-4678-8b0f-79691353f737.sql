-- Add module access permissions for organization_admin role
INSERT INTO public.role_module_access (module_id, role, can_view, can_edit, can_delete, can_admin)
SELECT md.id, 'organization_admin'::app_role, true, true, true, true
FROM public.module_definitions md
WHERE md.key IN ('core', 'user_management', 'organization')
ON CONFLICT DO NOTHING;