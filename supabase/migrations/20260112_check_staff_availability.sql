-- Function to check if a staff member is on vacation during a specific period
-- Used to block scheduling of shifts, trainings, etc.

CREATE OR REPLACE FUNCTION public.check_staff_availability(
  _staff_id UUID, 
  _start_time TIMESTAMP WITH TIME ZONE, 
  _end_time TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
  is_available BOOLEAN,
  conflict_reason TEXT
) SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Check for overlapping vacation splits (approved or pending?)
  -- Usually we block even if pending to be safe, or maybe only approved.
  -- "Vacations must block scheduling" implies verified vacations. 
  -- Let's check for 'approved' or 'pending_approval' to strictly prevent collisions.
  -- Ignoring 'rejected' or 'cancelled'.
  
  RETURN QUERY
  SELECT 
    FALSE as is_available,
    ('User is on vacation (' || vt.name || ') from ' || to_char(vs.start_date, 'YYYY-MM-DD') || ' to ' || to_char(vs.end_date, 'YYYY-MM-DD'))::TEXT as conflict_reason
  FROM public.vacation_splits vs
  JOIN public.vacation_plans vp ON vs.vacation_plan_id = vp.id
  JOIN public.vacation_types vt ON vp.vacation_type_id = vt.id
  WHERE vp.staff_id = _staff_id
  AND vp.status IN ('approved', 'pending_approval')
  AND (
    (vs.start_date <= _end_time::DATE AND vs.end_date >= _start_time::DATE)
  )
  LIMIT 1;

  -- If no rows returned, they are available (wrt vacations)
  IF NOT FOUND THEN
    RETURN QUERY SELECT TRUE, NULL::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;
