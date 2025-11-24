-- Add conflict tracking fields to vacation_approvals
ALTER TABLE vacation_approvals 
ADD COLUMN has_conflict boolean DEFAULT false,
ADD COLUMN conflict_reason text,
ADD COLUMN conflicting_plans jsonb;

-- Create function to detect vacation conflicts within same subdepartment
CREATE OR REPLACE FUNCTION check_vacation_conflicts(
  _vacation_plan_id uuid,
  _department_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflict_data jsonb;
  plan_splits record;
BEGIN
  -- Get all date ranges for the plan being checked
  SELECT jsonb_agg(
    jsonb_build_object(
      'plan_id', vp.id,
      'staff_id', vp.staff_id,
      'staff_name', p.full_name,
      'start_date', vs.start_date,
      'end_date', vs.end_date,
      'days', vs.days
    )
  ) INTO conflict_data
  FROM vacation_plans vp
  JOIN vacation_splits vs ON vs.vacation_plan_id = vp.id
  JOIN profiles p ON p.id = vp.staff_id
  WHERE vp.department_id = _department_id
    AND vp.id != _vacation_plan_id
    AND vp.status IN ('facility_pending', 'workspace_pending', 'approved')
    AND EXISTS (
      -- Check for date overlap with the current plan
      SELECT 1 
      FROM vacation_splits current_vs
      WHERE current_vs.vacation_plan_id = _vacation_plan_id
        AND (
          (vs.start_date BETWEEN current_vs.start_date AND current_vs.end_date)
          OR (vs.end_date BETWEEN current_vs.start_date AND current_vs.end_date)
          OR (current_vs.start_date BETWEEN vs.start_date AND vs.end_date)
        )
    );

  RETURN COALESCE(conflict_data, '[]'::jsonb);
END;
$$;