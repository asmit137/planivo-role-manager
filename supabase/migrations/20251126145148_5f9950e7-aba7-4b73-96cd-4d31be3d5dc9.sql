-- Add vacation rules configuration fields to workspaces table
ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS min_vacation_notice_days INTEGER DEFAULT 14,
ADD COLUMN IF NOT EXISTS max_concurrent_vacations INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS vacation_year_start_month INTEGER DEFAULT 1;

COMMENT ON COLUMN workspaces.min_vacation_notice_days IS 'Minimum days in advance for vacation requests';
COMMENT ON COLUMN workspaces.max_concurrent_vacations IS 'Maximum concurrent vacations allowed per department';
COMMENT ON COLUMN workspaces.vacation_year_start_month IS 'Month when vacation year starts (1=January)';