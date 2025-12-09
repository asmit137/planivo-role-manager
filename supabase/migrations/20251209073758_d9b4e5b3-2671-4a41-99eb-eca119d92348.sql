-- Drop existing policy that requires department facility_id match
DROP POLICY IF EXISTS "Facility supervisors can manage shifts" ON public.shifts;

-- Create updated policy that checks schedule's facility_id directly
CREATE POLICY "Facility supervisors can manage shifts" 
ON public.shifts 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM schedules s
    JOIN user_roles ur ON ur.facility_id = s.facility_id
    WHERE s.id = shifts.schedule_id 
    AND ur.user_id = auth.uid() 
    AND ur.role = 'facility_supervisor'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM schedules s
    JOIN user_roles ur ON ur.facility_id = s.facility_id
    WHERE s.id = shifts.schedule_id 
    AND ur.user_id = auth.uid() 
    AND ur.role = 'facility_supervisor'
  )
);