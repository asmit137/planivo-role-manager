-- ================================================================
-- DIAGNOSTIC AND REPAIR SCRIPT FOR USER MANAGEMENT
-- ================================================================
-- This script safely ensures all required columns, enums, tables, 
-- and functions exist for the User Management system.

-- 1. Ensure 'organization_admin' exists in app_role enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'organization_admin') THEN
        ALTER TYPE public.app_role ADD VALUE 'organization_admin';
    END IF;
END$$;

-- 2. Repair 'user_roles' table
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS specialty_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- 3. Repair 'organizations' table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS max_workspaces INTEGER,
ADD COLUMN IF NOT EXISTS max_facilities INTEGER,
ADD COLUMN IF NOT EXISTS max_users INTEGER;

-- 3b. Repair 'profiles' table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;


-- 4. Ensure Rate Limiting system exists
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  action_type text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(identifier, action_type)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages rate limits" ON public.rate_limits;
CREATE POLICY "Service role manages rate limits"
  ON public.rate_limits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. Helper Function for Rate Limiting
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
  
  DELETE FROM public.rate_limits 
  WHERE identifier = p_identifier 
    AND action_type = p_action_type 
    AND window_start < v_window_start;
  
  SELECT request_count INTO v_count
  FROM public.rate_limits
  WHERE identifier = p_identifier 
    AND action_type = p_action_type
    AND window_start >= v_window_start;
  
  IF v_count IS NULL THEN
    INSERT INTO public.rate_limits (identifier, action_type, request_count, window_start)
    VALUES (p_identifier, p_action_type, 1, now())
    ON CONFLICT (identifier, action_type) 
    DO UPDATE SET request_count = 1, window_start = now();
    RETURN true;
  ELSIF v_count >= p_max_requests THEN
    RETURN false;
  ELSE
    UPDATE public.rate_limits 
    SET request_count = request_count + 1
    WHERE identifier = p_identifier AND action_type = p_action_type;
    RETURN true;
  END IF;
END;
$$;

-- 6. Add RLS policy for admins to update profiles (needed for the active switch)
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'organization_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'organization_admin')
  );

-- 7. Refresh schema cache
NOTIFY pgrst, 'reload schema';

-- ================================================================
-- END OF SCRIPT
-- ================================================================
