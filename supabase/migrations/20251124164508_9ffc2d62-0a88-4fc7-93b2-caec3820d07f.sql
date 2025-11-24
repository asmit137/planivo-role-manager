-- Use CREATE OR REPLACE instead of DROP
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_exists BOOLEAN;
BEGIN
  -- Explicitly check without RLS by using security definer
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  ) INTO role_exists;
  
  RETURN role_exists;
END;
$$;