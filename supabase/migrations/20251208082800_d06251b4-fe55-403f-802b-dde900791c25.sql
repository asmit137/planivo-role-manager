-- Clear all operational data while preserving Super Admin and system templates

-- First, get the super admin user_id to preserve
DO $$
DECLARE
  super_admin_user_id uuid;
BEGIN
  -- Get super admin user id
  SELECT user_id INTO super_admin_user_id 
  FROM user_roles 
  WHERE role = 'super_admin' 
  LIMIT 1;

  -- Delete vacation data
  DELETE FROM vacation_approvals;
  DELETE FROM vacation_splits;
  DELETE FROM vacation_plans;

  -- Delete scheduling data
  DELETE FROM shift_assignments;
  DELETE FROM shifts;
  DELETE FROM schedules;

  -- Delete task data
  DELETE FROM task_assignments;
  DELETE FROM tasks;

  -- Delete messaging data
  DELETE FROM messages;
  DELETE FROM conversation_participants;
  DELETE FROM conversations;

  -- Delete notifications
  DELETE FROM notifications;

  -- Delete workspace assignments
  DELETE FROM workspace_categories;
  DELETE FROM workspace_departments;
  DELETE FROM workspace_module_access;

  -- Delete facility departments (non-template)
  DELETE FROM departments WHERE is_template = false;

  -- Delete facilities
  DELETE FROM facilities;

  -- Delete workspaces
  DELETE FROM workspaces;

  -- Delete organizations
  DELETE FROM organizations;

  -- Delete user roles except super_admin
  DELETE FROM user_roles WHERE role != 'super_admin';

  -- Delete profiles except super_admin
  IF super_admin_user_id IS NOT NULL THEN
    DELETE FROM profiles WHERE id != super_admin_user_id;
  END IF;

END $$;