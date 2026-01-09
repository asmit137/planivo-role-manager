-- Create a SECURITY DEFINER function to delete user data
-- This can be called via RPC from the frontend by Super Admins

CREATE OR REPLACE FUNCTION public.delete_user_cascade(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requesting_user_id UUID;
  is_super_admin BOOLEAN;
BEGIN
  -- Get the ID of the user making the request
  requesting_user_id := auth.uid();

  -- Check if the requesting user is a Super Admin
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = requesting_user_id AND role = 'super_admin'
  ) INTO is_super_admin;

  IF NOT is_super_admin THEN
    RAISE EXCEPTION 'Forbidden: Super Admin access required';
  END IF;

  -- Prevent self-deletion
  IF target_user_id = requesting_user_id THEN
    RAISE EXCEPTION 'You cannot delete your own account';
  END IF;

  -- Delete user roles first (should cascade, but being explicit)
  DELETE FROM public.user_roles WHERE user_id = target_user_id;

  -- Delete profile (this is the main record)
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- Note: The auth.users entry cannot be deleted from here (requires admin API).
  -- The user will be orphaned in auth.users but will have no profile or roles,
  -- effectively disabling their account.

  RETURN jsonb_build_object('success', true, 'message', 'User data deleted. Auth record remains orphaned.');
END;
$$;

-- Grant execute permission to authenticated users (function checks for super_admin internally)
GRANT EXECUTE ON FUNCTION public.delete_user_cascade(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
