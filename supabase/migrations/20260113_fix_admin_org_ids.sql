-- Migration: Fix missing organization_id for Admins
-- Description: Ensures organization_admin roles and owners have the correct organization_id set, allowing them to appear in filtered lists.

-- 1. Update user_roles for Organization Owners
-- If a user is the owner of an organization, their roles should likely belong to that organization.
UPDATE public.user_roles ur
SET organization_id = o.id
FROM public.organizations o
WHERE ur.user_id = o.owner_id
AND ur.organization_id IS NULL;

-- 2. Update 'organization_admin' roles if they have another role with an organization_id
-- (Self-healing: if they have a 'staff' role in the org, their 'admin' role belongs there too)
UPDATE public.user_roles target
SET organization_id = source.organization_id
FROM public.user_roles source
WHERE target.user_id = source.user_id
AND target.role = 'organization_admin'
AND target.organization_id IS NULL
AND source.organization_id IS NOT NULL;

-- 3. Notify Schema Reload
NOTIFY pgrst, 'reload schema';
