-- ============================================
-- SAFE REPAIR: Create training_event_targets Table
-- ============================================
-- This script safely creates the training_event_targets table
-- and its associated RLS policies.
-- Run this in your Supabase SQL Editor.

-- Create table for targeted event assignments (departments or specific users)
CREATE TABLE IF NOT EXISTS public.training_event_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.training_events(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('department', 'user')),
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_mandatory boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT valid_target CHECK (
    (target_type = 'department' AND department_id IS NOT NULL AND user_id IS NULL) OR
    (target_type = 'user' AND user_id IS NOT NULL AND department_id IS NULL)
  )
);

-- Add manual check-in columns to training_attendance (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'training_attendance' 
    AND column_name = 'checked_in_by'
  ) THEN
    ALTER TABLE public.training_attendance
    ADD COLUMN checked_in_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN checked_in_at timestamp with time zone,
    ADD COLUMN check_in_method text DEFAULT 'auto' CHECK (check_in_method IN ('auto', 'manual'));
  END IF;
END $$;

-- Enable RLS on training_event_targets
ALTER TABLE public.training_event_targets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (safe cleanup)
DROP POLICY IF EXISTS "Super admins can manage all targets" ON public.training_event_targets;
DROP POLICY IF EXISTS "Admins can manage targets for their organization events" ON public.training_event_targets;
DROP POLICY IF EXISTS "Users can view targets for events they can see" ON public.training_event_targets;
DROP POLICY IF EXISTS "Event coordinators can update attendance" ON public.training_attendance;

-- RLS policies for training_event_targets
CREATE POLICY "Super admins can manage all targets"
ON public.training_event_targets FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Admins can manage targets for their organization events"
ON public.training_event_targets FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM training_events te
    JOIN workspaces w ON w.organization_id = te.organization_id
    JOIN user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_event_targets.event_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('general_admin', 'workplace_supervisor', 'facility_supervisor')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM training_events te
    JOIN workspaces w ON w.organization_id = te.organization_id
    JOIN user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_event_targets.event_id
    AND ur.user_id = auth.uid()
    AND ur.role IN ('general_admin', 'workplace_supervisor', 'facility_supervisor')
  )
);

CREATE POLICY "Users can view targets for events they can see"
ON public.training_event_targets FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM training_events te
    JOIN workspaces w ON w.organization_id = te.organization_id
    JOIN user_roles ur ON ur.workspace_id = w.id
    WHERE te.id = training_event_targets.event_id
    AND ur.user_id = auth.uid()
  )
);

-- Event coordinators can manage attendance for their events
CREATE POLICY "Event coordinators can update attendance"
ON public.training_attendance FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM training_events te
    WHERE te.id = training_attendance.event_id
    AND te.responsible_user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_training_event_targets_event_id ON public.training_event_targets(event_id);
CREATE INDEX IF NOT EXISTS idx_training_event_targets_department_id ON public.training_event_targets(department_id);
CREATE INDEX IF NOT EXISTS idx_training_event_targets_user_id ON public.training_event_targets(user_id);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Training event targets table created successfully!';
END $$;
