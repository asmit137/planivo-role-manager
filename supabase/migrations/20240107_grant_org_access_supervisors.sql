-- Grant 'organization' module access to workplace_supervisor and facility_supervisor
-- And remove 'users' module access

DO $$ 
DECLARE
  m_org uuid := (SELECT id FROM module_definitions WHERE key = 'organization');
  m_users uuid := (SELECT id FROM module_definitions WHERE key = 'user_management');
  r_role app_role;
BEGIN
  -- WORKPLACE SUPERVISOR & FACILITY SUPERVISOR
  FOREACH r_role IN ARRAY ARRAY['workplace_supervisor', 'facility_supervisor']::app_role[] LOOP
    -- 1. Remove existing explicit access for Organization and User Management (to start clean)
    DELETE FROM public.role_module_access 
    WHERE role = r_role AND module_id IN (m_org, m_users);

    -- 2. Grant EDIT access to Organization (View + Edit)
    INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
    VALUES (r_role, m_org, true, true, false, false);
    
    -- 3. We deliberately do NOT insert User Management, which effectively defaults to NO ACCESS (implicit denial)
    -- This ensures they cannot see the Users tab.
  END LOOP;
END $$;
