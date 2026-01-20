-- =====================================================
-- FIX: Task Organization Scoping & Filtering
-- =====================================================
-- This script adds organization_id to tasks for robust multi-tenant scoping.

-- 1. Add organization_id column
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- 2. Helper to backfill organization_id
CREATE OR REPLACE FUNCTION public.backfill_task_organization_ids()
RETURNS VOID AS $$
BEGIN
  -- Backfill from workspace_id
  UPDATE public.tasks t
  SET organization_id = w.organization_id
  FROM public.workspaces w
  WHERE t.workspace_id = w.id
    AND t.organization_id IS NULL;

  -- Backfill from facility_id
  UPDATE public.tasks t
  SET organization_id = w.organization_id
  FROM public.facilities f
  JOIN public.workspaces w ON f.workspace_id = w.id
  WHERE t.facility_id = f.id
    AND t.organization_id IS NULL;

  -- Backfill from department_id
  UPDATE public.tasks t
  SET organization_id = w.organization_id
  FROM public.departments d
  JOIN public.facilities f ON d.facility_id = f.id
  JOIN public.workspaces w ON f.workspace_id = w.id
  WHERE t.department_id = d.id
    AND t.organization_id IS NULL;
END;
$$ LANGUAGE plpgsql;

SELECT public.backfill_task_organization_ids();

-- 3. Trigger for automatic organization_id assignment on insert
CREATE OR REPLACE FUNCTION public.set_task_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    IF NEW.workspace_id IS NOT NULL THEN
      SELECT organization_id INTO NEW.organization_id FROM public.workspaces WHERE id = NEW.workspace_id;
    ELSIF NEW.facility_id IS NOT NULL THEN
      SELECT w.organization_id INTO NEW.organization_id FROM public.facilities f JOIN public.workspaces w ON f.workspace_id = w.id WHERE f.id = NEW.facility_id;
    ELSIF NEW.department_id IS NOT NULL THEN
      SELECT w.organization_id INTO NEW.organization_id FROM public.departments d JOIN public.facilities f ON d.facility_id = f.id JOIN public.workspaces w ON f.workspace_id = w.id WHERE d.id = NEW.department_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_task_organization_id ON public.tasks;
CREATE TRIGGER trigger_set_task_organization_id
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_task_organization_id();

-- 4. Update RLS policies to use organization_id (Optimization)
-- We keep the existing policies but they are now implicitly safer if we filter by organization_id in queries.

-- Notify schema change
NOTIFY pgrst, 'reload schema';
