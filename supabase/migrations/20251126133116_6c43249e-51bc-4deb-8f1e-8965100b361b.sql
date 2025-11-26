-- First, drop the existing CHECK constraint on status
ALTER TABLE vacation_plans DROP CONSTRAINT IF EXISTS vacation_plans_status_check;

-- Update existing status values to new workflow
UPDATE vacation_plans 
SET status = 'facility_pending' 
WHERE status = 'submitted';

UPDATE vacation_plans 
SET status = 'workspace_pending' 
WHERE status = 'approved_level2';

UPDATE vacation_plans 
SET status = 'approved' 
WHERE status = 'approved_final';

-- Add new CHECK constraint with all valid status values
ALTER TABLE vacation_plans 
ADD CONSTRAINT vacation_plans_status_check 
CHECK (status IN ('draft', 'department_pending', 'facility_pending', 'workspace_pending', 'approved', 'rejected'));

-- Add a comment documenting the new 3-level approval workflow
COMMENT ON COLUMN vacation_plans.status IS 'Approval workflow: draft -> department_pending (Dept Head) -> facility_pending (Facility Supervisor) -> workspace_pending (Workspace Supervisor) -> approved';

-- Ensure approval_level column supports levels 1, 2, 3
COMMENT ON COLUMN vacation_approvals.approval_level IS 'Level 1 = Department Head, Level 2 = Facility Supervisor, Level 3 = Workspace Supervisor';