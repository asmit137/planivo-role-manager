
-- Add policy for facility supervisors to manage schedules in their facility
CREATE POLICY "Facility supervisors can manage facility schedules"
ON public.schedules FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.departments d ON d.id = schedules.department_id
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'facility_supervisor'
    AND ur.facility_id = d.facility_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.departments d ON d.id = schedules.department_id
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'facility_supervisor'
    AND ur.facility_id = d.facility_id
  )
);

-- Add facility_supervisor to shifts policy
CREATE POLICY "Facility supervisors can manage shifts"
ON public.shifts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.schedules s
    JOIN public.departments d ON d.id = s.department_id
    JOIN public.user_roles ur ON ur.facility_id = d.facility_id
    WHERE s.id = shifts.schedule_id
    AND ur.user_id = auth.uid()
    AND ur.role = 'facility_supervisor'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.schedules s
    JOIN public.departments d ON d.id = s.department_id
    JOIN public.user_roles ur ON ur.facility_id = d.facility_id
    WHERE s.id = shifts.schedule_id
    AND ur.user_id = auth.uid()
    AND ur.role = 'facility_supervisor'
  )
);

-- Add facility_supervisor to shift_assignments policy
CREATE POLICY "Facility supervisors can manage shift assignments"
ON public.shift_assignments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.shifts sh
    JOIN public.schedules s ON s.id = sh.schedule_id
    JOIN public.departments d ON d.id = s.department_id
    JOIN public.user_roles ur ON ur.facility_id = d.facility_id
    WHERE sh.id = shift_assignments.shift_id
    AND ur.user_id = auth.uid()
    AND ur.role = 'facility_supervisor'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.shifts sh
    JOIN public.schedules s ON s.id = sh.schedule_id
    JOIN public.departments d ON d.id = s.department_id
    JOIN public.user_roles ur ON ur.facility_id = d.facility_id
    WHERE sh.id = shift_assignments.shift_id
    AND ur.user_id = auth.uid()
    AND ur.role = 'facility_supervisor'
  )
);

-- Add scheduling module access for facility_supervisor
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'facility_supervisor', id, true, true, true, true
FROM public.module_definitions WHERE key = 'scheduling'
ON CONFLICT DO NOTHING;

-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
