-- =====================================================
-- SECURITY FIX: User Roles RLS Policies
-- =====================================================

-- Drop the dangerous policy that allows any authenticated user to manage roles
DROP POLICY IF EXISTS "Authenticated users can manage roles" ON public.user_roles;

-- Create proper RLS policies for user_roles
-- Only super_admin can insert new roles
CREATE POLICY "Super admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
);

-- Only super_admin can update roles
CREATE POLICY "Super admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Only super_admin can delete roles
CREATE POLICY "Super admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- =====================================================
-- SECURITY FIX: Profiles Table RLS (restrict email/phone exposure)
-- =====================================================

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Super admins can view all profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Admins in same workspace can view profiles (for user management)
CREATE POLICY "Workspace admins can view profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur1
    WHERE ur1.user_id = auth.uid()
    AND ur1.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role, 'facility_supervisor'::app_role, 'department_head'::app_role)
    AND EXISTS (
      SELECT 1 FROM user_roles ur2
      WHERE ur2.user_id = profiles.id
      AND (
        ur1.workspace_id = ur2.workspace_id
        OR ur1.facility_id = ur2.facility_id
        OR ur1.department_id = ur2.department_id
      )
    )
  )
);

-- =====================================================
-- SECURITY FIX: Jitsi Server Config (hide app_secret)
-- =====================================================

-- Drop the policy that exposes secrets to all authenticated users
DROP POLICY IF EXISTS "Authenticated users can view Jitsi config" ON public.jitsi_server_config;

-- Create a view that hides sensitive columns for regular users
CREATE OR REPLACE VIEW public.jitsi_server_public AS
SELECT 
  id,
  server_url,
  app_id,
  organization_id,
  is_active,
  created_at,
  updated_at
FROM public.jitsi_server_config
WHERE is_active = true;

-- Only allow viewing via the view for regular users
CREATE POLICY "Authenticated users can view Jitsi public config"
ON public.jitsi_server_config
FOR SELECT
TO authenticated
USING (
  is_active = true AND (
    -- Super admins see everything
    has_role(auth.uid(), 'super_admin'::app_role)
    -- Others only see non-secret fields (enforced via view)
    OR app_secret IS NULL
  )
);

-- =====================================================
-- SCHEDULE DISPLAY: Create display tokens table
-- =====================================================

CREATE TABLE IF NOT EXISTS public.schedule_display_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  facility_id uuid REFERENCES public.facilities(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  show_staff_names boolean DEFAULT true,
  refresh_interval_seconds integer DEFAULT 60,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  last_accessed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.schedule_display_tokens ENABLE ROW LEVEL SECURITY;

-- Allow public read with valid token (for the display screens)
CREATE POLICY "Anyone can verify display tokens"
ON public.schedule_display_tokens
FOR SELECT
TO anon, authenticated
USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Admins can manage display tokens
CREATE POLICY "Admins can manage display tokens"
ON public.schedule_display_tokens
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (workspace_id IN (SELECT get_user_workspaces(auth.uid())))
)
WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (workspace_id IN (SELECT get_user_workspaces(auth.uid())))
);

-- =====================================================
-- Create function to get public schedule data
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_public_schedule(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_record schedule_display_tokens%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Validate token
  SELECT * INTO v_token_record
  FROM schedule_display_tokens
  WHERE token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
    
  IF v_token_record.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid or expired token');
  END IF;
  
  -- Update last accessed
  UPDATE schedule_display_tokens 
  SET last_accessed_at = now() 
  WHERE id = v_token_record.id;
  
  -- Build schedule data
  SELECT jsonb_build_object(
    'token_name', v_token_record.name,
    'show_staff_names', v_token_record.show_staff_names,
    'refresh_interval', v_token_record.refresh_interval_seconds,
    'schedules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'start_date', s.start_date,
          'end_date', s.end_date,
          'department_name', d.name,
          'shifts', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', sh.id,
                'name', sh.name,
                'start_time', sh.start_time,
                'end_time', sh.end_time,
                'color', sh.color,
                'required_staff', sh.required_staff,
                'assignments', (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'id', sa.id,
                      'date', sa.assignment_date,
                      'status', sa.status,
                      'staff_name', CASE 
                        WHEN v_token_record.show_staff_names THEN p.full_name
                        ELSE 'Staff Member'
                      END
                    )
                  )
                  FROM shift_assignments sa
                  JOIN profiles p ON p.id = sa.staff_id
                  WHERE sa.shift_id = sh.id
                    AND sa.assignment_date >= CURRENT_DATE
                    AND sa.assignment_date <= CURRENT_DATE + interval '7 days'
                )
              )
              ORDER BY sh.shift_order
            )
            FROM shifts sh
            WHERE sh.schedule_id = s.id
          )
        )
      )
      FROM schedules s
      JOIN departments d ON d.id = s.department_id
      WHERE s.status = 'published'
        AND s.end_date >= CURRENT_DATE
        AND (
          v_token_record.department_id IS NULL OR s.department_id = v_token_record.department_id
        )
        AND (
          v_token_record.facility_id IS NULL OR s.facility_id = v_token_record.facility_id
        )
        AND (
          v_token_record.workspace_id IS NULL OR s.workspace_id = v_token_record.workspace_id
        )
    ), '[]'::jsonb)
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;