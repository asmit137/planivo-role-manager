-- Drop existing policy
DROP POLICY IF EXISTS "Facility supervisors can manage facility schedules" ON public.schedules;

-- Create updated policy that checks facility_id directly on schedules table
CREATE POLICY "Facility supervisors can manage facility schedules" 
ON public.schedules 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'facility_supervisor'
    AND ur.facility_id = schedules.facility_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'facility_supervisor'
    AND ur.facility_id = schedules.facility_id
  )
);