-- Migration: Backfill User Role Hierarchy
-- Description: Ensures all user_roles have workspace_id, facility_id, and organization_id by resolving them from department_id.

-- 1. Backfill facility_id from department_id
UPDATE public.user_roles ur
SET facility_id = d.facility_id
FROM public.departments d
WHERE ur.department_id = d.id
AND ur.facility_id IS NULL;

-- 2. Backfill workspace_id from facility_id
UPDATE public.user_roles ur
SET workspace_id = f.workspace_id
FROM public.facilities f
WHERE ur.facility_id = f.id
AND ur.workspace_id IS NULL;

-- 3. Backfill organization_id from workspace_id
UPDATE public.user_roles ur
SET organization_id = w.organization_id
FROM public.workspaces w
WHERE ur.workspace_id = w.id
AND ur.organization_id IS NULL;

-- 4. Reload schema cache
NOTIFY pgrst, 'reload schema';
