-- Add training module to module_definitions (if not exists)
INSERT INTO public.module_definitions (key, name, description, icon, is_active)
SELECT 'training', 'Training & Events', 'Manage training sessions and events for the organization', 'GraduationCap', true
WHERE NOT EXISTS (SELECT 1 FROM module_definitions WHERE key = 'training');

-- Add role access for training module with proper casting
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'super_admin'::app_role, id, true, true, true, true FROM module_definitions WHERE key = 'training'
  AND NOT EXISTS (SELECT 1 FROM role_module_access WHERE module_id = (SELECT id FROM module_definitions WHERE key = 'training') AND role = 'super_admin'::app_role);

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'general_admin'::app_role, id, true, true, true, false FROM module_definitions WHERE key = 'training'
  AND NOT EXISTS (SELECT 1 FROM role_module_access WHERE module_id = (SELECT id FROM module_definitions WHERE key = 'training') AND role = 'general_admin'::app_role);

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'workplace_supervisor'::app_role, id, true, true, true, false FROM module_definitions WHERE key = 'training'
  AND NOT EXISTS (SELECT 1 FROM role_module_access WHERE module_id = (SELECT id FROM module_definitions WHERE key = 'training') AND role = 'workplace_supervisor'::app_role);

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'facility_supervisor'::app_role, id, true, true, true, false FROM module_definitions WHERE key = 'training'
  AND NOT EXISTS (SELECT 1 FROM role_module_access WHERE module_id = (SELECT id FROM module_definitions WHERE key = 'training') AND role = 'facility_supervisor'::app_role);

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'department_head'::app_role, id, true, false, false, false FROM module_definitions WHERE key = 'training'
  AND NOT EXISTS (SELECT 1 FROM role_module_access WHERE module_id = (SELECT id FROM module_definitions WHERE key = 'training') AND role = 'department_head'::app_role);

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'staff'::app_role, id, true, false, false, false FROM module_definitions WHERE key = 'training'
  AND NOT EXISTS (SELECT 1 FROM role_module_access WHERE module_id = (SELECT id FROM module_definitions WHERE key = 'training') AND role = 'staff'::app_role);