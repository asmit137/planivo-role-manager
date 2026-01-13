-- Add vacation_mode to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS vacation_mode text NOT NULL DEFAULT 'full' 
CHECK (vacation_mode IN ('planning', 'full'));

COMMENT ON COLUMN organizations.vacation_mode IS 'Determines if vacation reduces balance (full) or is just for scheduling (planning)';
