-- Add organization_admin access to all monitoring modules
INSERT INTO role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'organization_admin'::app_role, id, true, true, false, false
FROM module_definitions 
WHERE key IN ('vacation_planning', 'scheduling', 'task_management', 
              'messaging', 'notifications', 'staff_management', 'training')
ON CONFLICT DO NOTHING;