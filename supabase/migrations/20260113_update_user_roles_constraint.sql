-- Migration: Update user_roles unique constraint
-- Description: Ensures that role assignments are unique and can be correctly upserted with organizational scoping.

-- 1. Remove orphaned or duplicate roles if they exist (conservative approach)
-- In a real system, you might want to be more careful here, but for this fix:
DELETE FROM public.user_roles a USING (
    SELECT MIN(ctid) as ctid, user_id, role, workspace_id, facility_id, department_id, organization_id
    FROM public.user_roles 
    GROUP BY user_id, role, workspace_id, facility_id, department_id, organization_id 
    HAVING COUNT(*) > 1
) b
WHERE a.user_id = b.user_id 
AND a.role = b.role 
AND (a.workspace_id = b.workspace_id OR (a.workspace_id IS NULL AND b.workspace_id IS NULL))
AND (a.facility_id = b.facility_id OR (a.facility_id IS NULL AND b.facility_id IS NULL))
AND (a.department_id = b.department_id OR (a.department_id IS NULL AND b.department_id IS NULL))
AND (a.organization_id = b.organization_id OR (a.organization_id IS NULL AND b.organization_id IS NULL))
AND a.ctid <> b.ctid;

-- 2. Add the comprehensive unique constraint
-- This matches the onConflict target in our Edge Functions
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_comprehensive_key'
    ) THEN
        ALTER TABLE public.user_roles 
        ADD CONSTRAINT user_roles_comprehensive_key 
        UNIQUE (user_id, role, workspace_id, facility_id, department_id, organization_id);
    END IF;
END $$;

-- 3. Reload schema
NOTIFY pgrst, 'reload schema';
