-- ============================================
-- Rate Limiting Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  action_type text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(identifier, action_type)
);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can manage rate limits (edge functions use service role)
CREATE POLICY "Service role manages rate limits"
  ON public.rate_limits
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- Audit Logs Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  performed_by uuid,
  performed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Super admins can view audit logs
CREATE POLICY "Super admins can view audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (has_role(auth.uid(), 'super_admin'));

-- Service role can insert audit logs
CREATE POLICY "Service role can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (true);

-- Create index for faster queries
CREATE INDEX idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_performed_at ON public.audit_logs(performed_at DESC);
CREATE INDEX idx_audit_logs_performed_by ON public.audit_logs(performed_by);

-- ============================================
-- Audit Log Trigger Function
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_cols text[];
  old_record jsonb;
  new_record jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_record := to_jsonb(OLD);
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, performed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', old_record, auth.uid());
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    old_record := to_jsonb(OLD);
    new_record := to_jsonb(NEW);
    -- Get changed fields
    SELECT array_agg(key) INTO changed_cols
    FROM jsonb_each(new_record) AS n(key, value)
    WHERE old_record->key IS DISTINCT FROM n.value;
    
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_fields, performed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', old_record, new_record, changed_cols, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    new_record := to_jsonb(NEW);
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, performed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', new_record, auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- ============================================
-- Apply Audit Triggers to Critical Tables
-- ============================================
CREATE TRIGGER audit_user_roles_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER audit_profiles_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER audit_vacation_plans_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.vacation_plans
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER audit_schedules_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER audit_organizations_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

CREATE TRIGGER audit_workspaces_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- ============================================
-- Rate Limit Helper Function
-- ============================================
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
  
  -- Clean old entries and get/update current count
  DELETE FROM public.rate_limits 
  WHERE identifier = p_identifier 
    AND action_type = p_action_type 
    AND window_start < v_window_start;
  
  -- Try to get existing record
  SELECT request_count INTO v_count
  FROM public.rate_limits
  WHERE identifier = p_identifier 
    AND action_type = p_action_type
    AND window_start >= v_window_start;
  
  IF v_count IS NULL THEN
    -- First request in window
    INSERT INTO public.rate_limits (identifier, action_type, request_count, window_start)
    VALUES (p_identifier, p_action_type, 1, now())
    ON CONFLICT (identifier, action_type) 
    DO UPDATE SET request_count = 1, window_start = now();
    RETURN true;
  ELSIF v_count >= p_max_requests THEN
    -- Rate limit exceeded
    RETURN false;
  ELSE
    -- Increment counter
    UPDATE public.rate_limits 
    SET request_count = request_count + 1
    WHERE identifier = p_identifier AND action_type = p_action_type;
    RETURN true;
  END IF;
END;
$$;