-- ================================================================
-- REPAIR BULK UPLOAD DEPENDENCIES
-- ================================================================

-- 1. Ensure all roles exist in app_role enum
DO $$
BEGIN
    -- Add organization_admin
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'organization_admin') THEN
        ALTER TYPE public.app_role ADD VALUE 'organization_admin';
    END IF;
    
    -- Add workspace_supervisor (often confused with workplace_supervisor)
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'workspace_supervisor') THEN
        ALTER TYPE public.app_role ADD VALUE 'workspace_supervisor';
    END IF;
    
    -- Add intern
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'intern') THEN
        ALTER TYPE public.app_role ADD VALUE 'intern';
    END IF;
    
    -- Add custom
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'custom') THEN
        ALTER TYPE public.app_role ADD VALUE 'custom';
    END IF;
END$$;

-- 2. Ensure upsert_profile_safe exists
CREATE OR REPLACE FUNCTION public.upsert_profile_safe(
  _id UUID,
  _email TEXT,
  _full_name TEXT,
  _created_by UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    created_by, 
    is_active, 
    force_password_change,
    updated_at
  )
  VALUES (
    _id, 
    _email, 
    _full_name, 
    _created_by, 
    true,
    true,
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_active = COALESCE(public.profiles.is_active, true),
    updated_at = NOW();
END;
$$;

-- 3. Ensure check_rate_limit exists (Fast version)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier text,
  p_action_type text,
  p_max_requests integer DEFAULT 10,
  p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_window_start timestamptz;
BEGIN
  v_window_start := now() - (p_window_seconds || ' seconds')::interval;
  
  -- Clean and update in one go if possible
  DELETE FROM public.rate_limits 
  WHERE identifier = p_identifier 
    AND action_type = p_action_type 
    AND window_start < v_window_start;
  
  INSERT INTO public.rate_limits (identifier, action_type, request_count, window_start)
  VALUES (p_identifier, p_action_type, 1, now())
  ON CONFLICT (identifier, action_type) 
  DO UPDATE SET 
    request_count = CASE 
      WHEN public.rate_limits.window_start < v_window_start THEN 1 
      ELSE public.rate_limits.request_count + 1 
    END,
    window_start = CASE 
      WHEN public.rate_limits.window_start < v_window_start THEN now() 
      ELSE public.rate_limits.window_start 
    END
  RETURNING request_count INTO v_count;
  
  RETURN v_count <= p_max_requests;
END;
$$;

-- 4. Add performance indices for bulk operations
CREATE INDEX IF NOT EXISTS idx_organizations_name ON public.organizations(name);
CREATE INDEX IF NOT EXISTS idx_workspaces_name_org ON public.workspaces(name, organization_id);
CREATE INDEX IF NOT EXISTS idx_facilities_name_ws ON public.facilities(name, workspace_id);
CREATE INDEX IF NOT EXISTS idx_departments_name_fac ON public.departments(name, facility_id);

-- Refresh schema
NOTIFY pgrst, 'reload schema';
