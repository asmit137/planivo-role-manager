-- Add max_vacation_splits setting to workspaces table
ALTER TABLE workspaces 
ADD COLUMN max_vacation_splits integer NOT NULL DEFAULT 6;

-- Update vacation_plans table to allow staff to create their own plans
-- The RLS policies already support this, just need to ensure staff_id matches creator

-- Add a comment to clarify the workflow
COMMENT ON COLUMN vacation_plans.created_by IS 'Department Head who creates the plan, or the staff member themselves';
COMMENT ON COLUMN vacation_plans.staff_id IS 'Staff member the vacation plan is for';
COMMENT ON COLUMN workspaces.max_vacation_splits IS 'Maximum number of vacation splits allowed per plan';