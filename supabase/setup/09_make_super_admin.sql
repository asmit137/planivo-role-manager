-- STEP 9: MAKE A USER SUPER ADMIN
-- Replace 'marishimohd@gmail.com' with the email of the user you want to promote

DO $$
DECLARE
    target_email TEXT := 'marishimohd@gmail.com'; -- <--- CHANGE THIS EMAIL IF NEEDED
    target_user_id UUID;
BEGIN
    -- 1. Get the User ID from Supabase Auth
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NULL THEN
        RAISE NOTICE 'User with email % not found. Please make sure they have signed up first.', target_email;
    ELSE
        -- 2. Ensure a Profile exists (if not created by trigger)
        INSERT INTO public.profiles (id, email, full_name)
        VALUES (target_user_id, target_email, 'Super Admin')
        ON CONFLICT (id) DO NOTHING;

        -- 3. Assign the Super Admin role
        -- workspace_id is NULL for a global super admin
        INSERT INTO public.user_roles (user_id, role)
        VALUES (target_user_id, 'super_admin'::app_role)
        ON CONFLICT (user_id, workspace_id, role) DO NOTHING;

        RAISE NOTICE 'User % has been promoted to Super Admin successfully!', target_email;
    END IF;
END $$;

-- Verify the result
SELECT p.email, r.role 
FROM public.profiles p
JOIN public.user_roles r ON p.id = r.user_id
WHERE r.role = 'super_admin';
