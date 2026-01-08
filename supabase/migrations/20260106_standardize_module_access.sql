-- ================================================================
-- STANDARDIZE MODULE ACCESS MIGRATION (COMPLETE)
-- ================================================================

-- 1. Ensure all 19 modules are defined
INSERT INTO public.module_definitions (name, key, description, icon, is_active)
VALUES 
  ('Dashboard', 'core', 'Main dashboard and system overview', 'LayoutDashboard', true),
  ('Users', 'user_management', 'User management and role assignment', 'Users', true),
  ('Organization', 'organization', 'Organization structure and settings', 'Building2', true),
  ('Staff', 'staff_management', 'Staff assignment and management', 'UserCog', true),
  ('Vacation', 'vacation_planning', 'Vacation planning and approval', 'Calendar', true),
  ('Scheduling', 'scheduling', 'Staff scheduling and shift management', 'CalendarClock', true),
  ('Tasks', 'task_management', 'Task assignment and tracking', 'CheckSquare', true),
  ('Meeting & Training', 'training', 'Training sessions and events', 'GraduationCap', true),
  ('Messages', 'messaging', 'Internal messaging system', 'MessageSquare', true),
  ('Notifications', 'notifications', 'System notifications and alerts', 'Bell', true),
  ('Analytics', 'analytics', 'System analytics and reporting', 'BarChart3', true),
  ('Audit Logs', 'audit', 'System audit logs and tracking', 'FileText', true),
  ('Broadcasts', 'emails', 'Email broadcasts and communications', 'Mail', true),
  ('Settings', 'settings', 'System settings and configuration', 'Cog', true),
  ('Module Access', 'modules', 'Manage module access and permissions', 'Settings', true),
  ('Live Activity', 'activity', 'Real-time system activity monitoring', 'Activity', true),
  ('Security', 'security', 'System security and protection settings', 'Shield', true),
  ('System Validator', 'validator', 'System health and validation tools', 'ShieldCheck', true),
  ('Source Code', 'source-code', 'View system source code (Dev Only)', 'Code', true)
ON CONFLICT (key) DO UPDATE SET 
  name = EXCLUDED.name,
  icon = EXCLUDED.icon,
  is_active = true;

-- 2. Clear existing role permissions to apply the new matrix
DELETE FROM public.role_module_access;

-- 3. Define helper for matrix insertion
DO $$ 
DECLARE
  m_core uuid := (SELECT id FROM module_definitions WHERE key = 'core');
  m_users uuid := (SELECT id FROM module_definitions WHERE key = 'user_management');
  m_org uuid := (SELECT id FROM module_definitions WHERE key = 'organization');
  m_staff uuid := (SELECT id FROM module_definitions WHERE key = 'staff_management');
  m_vacation uuid := (SELECT id FROM module_definitions WHERE key = 'vacation_planning');
  m_sched uuid := (SELECT id FROM module_definitions WHERE key = 'scheduling');
  m_tasks uuid := (SELECT id FROM module_definitions WHERE key = 'task_management');
  m_train uuid := (SELECT id FROM module_definitions WHERE key = 'training');
  m_msg uuid := (SELECT id FROM module_definitions WHERE key = 'messaging');
  m_notif uuid := (SELECT id FROM module_definitions WHERE key = 'notifications');
  m_analytics uuid := (SELECT id FROM module_definitions WHERE key = 'analytics');
  m_audit uuid := (SELECT id FROM module_definitions WHERE key = 'audit');
  m_emails uuid := (SELECT id FROM module_definitions WHERE key = 'emails');
  m_settings uuid := (SELECT id FROM module_definitions WHERE key = 'settings');
  m_modules uuid := (SELECT id FROM module_definitions WHERE key = 'modules');
  m_activity uuid := (SELECT id FROM module_definitions WHERE key = 'activity');
  m_security uuid := (SELECT id FROM module_definitions WHERE key = 'security');
  m_validator uuid := (SELECT id FROM module_definitions WHERE key = 'validator');
  m_source uuid := (SELECT id FROM module_definitions WHERE key = 'source-code');
  r_role app_role;
BEGIN
  -- SUPER ADMIN (All Access to Everything)
  INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
  SELECT 'super_admin'::app_role, id, true, true, true, true FROM public.module_definitions;

  -- ORGANIZATION ADMIN & GENERAL ADMIN
  FOREACH r_role IN ARRAY ARRAY['organization_admin', 'general_admin']::app_role[] LOOP
    -- Standard modules (Full Access)
    INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
    SELECT r_role, id, true, true, true, true FROM public.module_definitions 
    WHERE id NOT IN (m_analytics, m_audit, m_emails, m_settings, m_modules, m_activity, m_security, m_validator, m_source);
    
    -- System modules (View Only or Specific Access)
    INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
    SELECT r_role, id, true, false, false, false FROM public.module_definitions 
    WHERE id IN (m_analytics, m_audit, m_settings);
  END LOOP;

  -- WORKPLACE SUPERVISOR & FACILITY SUPERVISOR
  FOREACH r_role IN ARRAY ARRAY['workplace_supervisor', 'facility_supervisor']::app_role[] LOOP
    -- View Only
    INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
    SELECT r_role, id, true, false, false, false FROM public.module_definitions 
    WHERE id IN (m_users, m_org, m_staff, m_sched);
    -- Full Access
    INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
    SELECT r_role, id, true, true, true, true FROM public.module_definitions 
    WHERE id IN (m_core, m_vacation, m_tasks, m_train, m_msg, m_notif);
  END LOOP;

  -- DEPARTMENT HEAD
  -- View Only
  INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
  SELECT 'department_head'::app_role, m_train, true, false, false, false;
  -- Full Access
  INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
  SELECT 'department_head'::app_role, id, true, true, true, true FROM public.module_definitions 
  WHERE id IN (m_core, m_staff, m_vacation, m_sched, m_tasks, m_msg, m_notif);

  -- STAFF
  -- View Only
  INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
  SELECT 'staff'::app_role, id, true, false, false, false FROM public.module_definitions 
  WHERE id IN (m_vacation, m_sched, m_tasks, m_train);
  -- Edit Access (Messaging)
  INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
  SELECT 'staff'::app_role, m_msg, true, true, false, false;
  -- Full Access (Core, Notifications)
  INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
  SELECT 'staff'::app_role, id, true, true, true, true FROM public.module_definitions 
  WHERE id IN (m_core, m_notif);

END $$;

-- 4. Reload schema for PostgREST
NOTIFY pgrst, 'reload schema';
