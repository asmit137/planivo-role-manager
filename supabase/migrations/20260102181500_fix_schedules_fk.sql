-- Drop the existing foreign key constraint
ALTER TABLE public.schedules
DROP CONSTRAINT IF EXISTS schedules_workspace_id_fkey;

-- Re-add the constraint with ON DELETE CASCADE
ALTER TABLE public.schedules
ADD CONSTRAINT schedules_workspace_id_fkey
FOREIGN KEY (workspace_id)
REFERENCES public.workspaces(id)
ON DELETE CASCADE;
