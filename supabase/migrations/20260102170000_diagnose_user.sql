-- Check user roles for specific email
SELECT u.email, ur.role, ur.workspace_id, ur.facility_id
FROM auth.users u
JOIN public.user_roles ur ON ur.user_id = u.id
WHERE u.email = 'marishimohd@gmail.com';

-- Check facilities count
SELECT count(*) FROM public.facilities;
