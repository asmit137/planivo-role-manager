-- Create function to check if a user has overlapping vacation plans
CREATE OR REPLACE FUNCTION public.check_user_vacation_overlap(
  _staff_id uuid,
  _splits jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  overlap_data jsonb;
  split_record jsonb;
  start_date date;
  end_date date;
BEGIN
  -- Build array of overlapping vacation plans
  SELECT jsonb_agg(
    jsonb_build_object(
      'plan_id', vp.id,
      'vacation_type', vt.name,
      'start_date', vs.start_date,
      'end_date', vs.end_date,
      'days', vs.days,
      'status', vp.status
    )
  ) INTO overlap_data
  FROM vacation_plans vp
  JOIN vacation_splits vs ON vs.vacation_plan_id = vp.id
  JOIN vacation_types vt ON vt.id = vp.vacation_type_id
  WHERE vp.staff_id = _staff_id
    AND vp.status NOT IN ('rejected', 'draft')
    AND EXISTS (
      -- Check each split in the input against existing splits
      SELECT 1
      FROM jsonb_array_elements(_splits) AS input_split
      WHERE (
        -- Date overlap logic
        (vs.start_date::date BETWEEN (input_split->>'start_date')::date AND (input_split->>'end_date')::date)
        OR (vs.end_date::date BETWEEN (input_split->>'start_date')::date AND (input_split->>'end_date')::date)
        OR ((input_split->>'start_date')::date BETWEEN vs.start_date AND vs.end_date)
        OR ((input_split->>'end_date')::date BETWEEN vs.start_date AND vs.end_date)
      )
    );

  RETURN COALESCE(overlap_data, '[]'::jsonb);
END;
$$;