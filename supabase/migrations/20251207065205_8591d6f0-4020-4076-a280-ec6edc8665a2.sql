
-- Create schedules table
CREATE TABLE public.schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  facility_id UUID REFERENCES public.facilities(id),
  workspace_id UUID REFERENCES public.workspaces(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  shift_count INTEGER NOT NULL DEFAULT 1 CHECK (shift_count >= 1 AND shift_count <= 3),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shifts table
CREATE TABLE public.shifts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  shift_order INTEGER NOT NULL CHECK (shift_order >= 1 AND shift_order <= 3),
  required_staff INTEGER NOT NULL DEFAULT 1,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shift_assignments table
CREATE TABLE public.shift_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assignment_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled')),
  assigned_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(shift_id, staff_id, assignment_date)
);

-- Enable RLS
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_assignments ENABLE ROW LEVEL SECURITY;

-- RLS for schedules: Department heads can manage their department's schedules
CREATE POLICY "Department heads can manage schedules"
ON public.schedules FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'department_head'
    AND ur.department_id = schedules.department_id
  )
  OR has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'department_head'
    AND ur.department_id = schedules.department_id
  )
  OR has_role(auth.uid(), 'super_admin')
);

-- Staff can view published schedules in their department
CREATE POLICY "Staff can view published schedules"
ON public.schedules FOR SELECT
USING (
  status = 'published'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.department_id = schedules.department_id
  )
);

-- RLS for shifts: inherit from schedule permissions
CREATE POLICY "Users can manage shifts based on schedule access"
ON public.shifts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.schedules s
    JOIN public.user_roles ur ON ur.department_id = s.department_id
    WHERE s.id = shifts.schedule_id
    AND ur.user_id = auth.uid()
    AND (ur.role = 'department_head' OR has_role(auth.uid(), 'super_admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.schedules s
    JOIN public.user_roles ur ON ur.department_id = s.department_id
    WHERE s.id = shifts.schedule_id
    AND ur.user_id = auth.uid()
    AND (ur.role = 'department_head' OR has_role(auth.uid(), 'super_admin'))
  )
);

-- Staff can view shifts from published schedules
CREATE POLICY "Staff can view shifts from published schedules"
ON public.shifts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.schedules s
    JOIN public.user_roles ur ON ur.department_id = s.department_id
    WHERE s.id = shifts.schedule_id
    AND s.status = 'published'
    AND ur.user_id = auth.uid()
  )
);

-- RLS for shift_assignments
CREATE POLICY "Department heads can manage assignments"
ON public.shift_assignments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.shifts sh
    JOIN public.schedules s ON s.id = sh.schedule_id
    JOIN public.user_roles ur ON ur.department_id = s.department_id
    WHERE sh.id = shift_assignments.shift_id
    AND ur.user_id = auth.uid()
    AND (ur.role = 'department_head' OR has_role(auth.uid(), 'super_admin'))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.shifts sh
    JOIN public.schedules s ON s.id = sh.schedule_id
    JOIN public.user_roles ur ON ur.department_id = s.department_id
    WHERE sh.id = shift_assignments.shift_id
    AND ur.user_id = auth.uid()
    AND (ur.role = 'department_head' OR has_role(auth.uid(), 'super_admin'))
  )
);

-- Staff can view their own assignments
CREATE POLICY "Staff can view their assignments"
ON public.shift_assignments FOR SELECT
USING (
  staff_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.shifts sh
    JOIN public.schedules s ON s.id = sh.schedule_id
    WHERE sh.id = shift_assignments.shift_id
    AND s.status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.department_id = s.department_id
    )
  )
);

-- Create triggers for updated_at
CREATE TRIGGER update_schedules_updated_at
BEFORE UPDATE ON public.schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shift_assignments_updated_at
BEFORE UPDATE ON public.shift_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add scheduling module to module_definitions
INSERT INTO public.module_definitions (key, name, description, icon, is_active)
VALUES ('scheduling', 'Scheduling', 'Staff scheduling and shift management', 'Calendar', true)
ON CONFLICT (key) DO NOTHING;

-- Add module access for department_head (full access) and staff (view only)
INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'department_head', id, true, true, true, true
FROM public.module_definitions WHERE key = 'scheduling'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'staff', id, true, false, false, false
FROM public.module_definitions WHERE key = 'scheduling'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_module_access (role, module_id, can_view, can_edit, can_delete, can_admin)
SELECT 'super_admin', id, true, true, true, true
FROM public.module_definitions WHERE key = 'scheduling'
ON CONFLICT DO NOTHING;
