-- Migration: Add organization_id to user_roles
-- Description: Adds organization_id column to user_roles table for organizational scoping.

-- 1. Add organization_id column
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_roles' AND column_name = 'organization_id') THEN
    ALTER TABLE public.user_roles ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Backfill organization_id from workspaces
-- Most roles are linked to a workspace, which is linked to an organization.
UPDATE public.user_roles ur
SET organization_id = w.organization_id
FROM public.workspaces w
WHERE ur.workspace_id = w.id
AND ur.organization_id IS NULL;

-- 3. Backfill organization_id for roles without workspaces (if any)
-- This is harder, but we can try to find an organization the user is already associated with
-- via other roles if they exist. For now, workspace-based backfill is safer.

-- 4. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
