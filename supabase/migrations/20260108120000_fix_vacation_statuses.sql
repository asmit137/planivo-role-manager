-- migration file: supabase/migrations/20260108120000_fix_vacation_statuses.sql

-- 1. Drop the existing CHECK constraint on status
ALTER TABLE public.vacation_plans DROP CONSTRAINT IF EXISTS vacation_plans_status_check;

-- 2. Add new CHECK constraint with all valid status values including 'pending_approval' and 'cancelled'
ALTER TABLE public.vacation_plans 
ADD CONSTRAINT vacation_plans_status_check 
CHECK (status IN (
  'draft', 
  'pending_approval', 
  'department_pending', 
  'facility_pending', 
  'workspace_pending', 
  'approved', 
  'rejected', 
  'cancelled'
));

-- 3. Update the comment on the status column to reflect the current workflow
COMMENT ON COLUMN public.vacation_plans.status IS 'Approval workflow: draft -> pending_approval -> department_pending (Dept Head) -> facility_pending (Facility Supervisor) -> workspace_pending (Workspace Supervisor) -> approved';

-- 4. Notify PostgREST to reload the schema
NOTIFY pgrst, 'reload schema';
