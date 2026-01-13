-- Function to safely upsert a profile, handling the INSERT ... ON CONFLICT logic atomically
-- This prevents race conditions where checking for existence and then inserting can fail if a record is inserted in between.

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
  -- Attempt to insert the profile.
  -- If it conflicts (id already exists), update the existing record.
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
    true,         -- Default is_active to true
    true,         -- Default force_password_change to true (for bulk uploaded users)
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_active = CASE 
                  WHEN public.profiles.is_active IS NULL THEN true 
                  ELSE public.profiles.is_active 
                END, -- Keep existing status or set to true if null
    updated_at = NOW();
    
    -- Note: We generally don't want to reset force_password_change on existing users if they already set it to false,
    -- so we exclude it from the UPDATE SET clause, unless we specifically want to force it again.
    -- For now, we only force it on NEW inserts.
END;
$$;
