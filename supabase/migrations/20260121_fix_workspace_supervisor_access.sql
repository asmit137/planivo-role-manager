-- ================================================================
-- FIX WORKSPACE SUPERVISOR ACCESS
-- ================================================================

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
BEGIN
    -- View Only
    INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
    SELECT 'workspace_supervisor'::app_role, id, true, false, false, false FROM public.module_definitions 
    WHERE id IN (m_users, m_org, m_staff, m_sched)
    ON CONFLICT DO NOTHING;

    -- Full Access
    INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
    SELECT 'workspace_supervisor'::app_role, id, true, true, true, true FROM public.module_definitions 
    WHERE id IN (m_core, m_vacation, m_tasks, m_train, m_msg, m_notif)
    ON CONFLICT DO NOTHING;

END $$;
