-- Check if 'organization_admin' role exists in enum
SELECT enum_range(NULL::public.app_role);

-- Simulate the query for organization admins
SELECT user_id FROM public.user_roles WHERE role = 'organization_admin';

-- Check if those user_ids exist in profiles
WITH admin_users AS (
    SELECT user_id FROM public.user_roles WHERE role = 'organization_admin'
)
SELECT p.id, p.full_name, p.email 
FROM public.profiles p
JOIN admin_users au ON p.id = au.user_id;

-- Check for orphaned user_roles (user_id not in profiles)
SELECT * FROM public.user_roles 
WHERE role = 'organization_admin' 
AND user_id NOT IN (SELECT id FROM public.profiles);
