-- Vacation Types Table (managed by Super Admin)
CREATE TABLE public.vacation_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  max_days INTEGER,
  requires_documentation BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Vacation Plans Table (created by Department Heads)
CREATE TABLE public.vacation_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL,
  department_id UUID NOT NULL REFERENCES public.departments(id),
  vacation_type_id UUID NOT NULL REFERENCES public.vacation_types(id),
  total_days INTEGER NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved_level2', 'approved_final', 'rejected')),
  submitted_at TIMESTAMP WITH TIME ZONE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Vacation Plan Splits (up to 6 splits per plan)
CREATE TABLE public.vacation_splits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vacation_plan_id UUID NOT NULL REFERENCES public.vacation_plans(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Vacation Approvals (multi-level)
CREATE TABLE public.vacation_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vacation_plan_id UUID NOT NULL REFERENCES public.vacation_plans(id) ON DELETE CASCADE,
  approval_level INTEGER NOT NULL CHECK (approval_level IN (2, 3)),
  approver_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(vacation_plan_id, approval_level)
);

-- Tasks Table (role-scoped creation)
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('workspace', 'facility', 'department')),
  workspace_id UUID REFERENCES public.workspaces(id),
  facility_id UUID REFERENCES public.facilities(id),
  department_id UUID REFERENCES public.departments(id),
  due_date DATE,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Task Assignments (for staff)
CREATE TABLE public.task_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vacation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vacation_types
CREATE POLICY "Super admins can manage vacation types"
  ON public.vacation_types FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "All authenticated users can view vacation types"
  ON public.vacation_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- RLS Policies for vacation_plans
CREATE POLICY "Department heads can create plans for their department"
  ON public.vacation_plans FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND ur.role = 'department_head'::app_role
        AND ur.department_id = vacation_plans.department_id
    )
  );

CREATE POLICY "Users can view plans in their scope"
  ON public.vacation_plans FOR SELECT
  USING (
    staff_id = auth.uid() OR
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND (
          ur.role IN ('super_admin'::app_role, 'workplace_supervisor'::app_role) OR
          (ur.role = 'facility_supervisor'::app_role AND department_id IN (
            SELECT id FROM public.departments WHERE facility_id = ur.facility_id
          )) OR
          (ur.role = 'department_head'::app_role AND ur.department_id = vacation_plans.department_id)
        )
    )
  );

CREATE POLICY "Plan creators can update draft plans"
  ON public.vacation_plans FOR UPDATE
  USING (created_by = auth.uid() AND status = 'draft');

-- RLS Policies for vacation_splits
CREATE POLICY "Splits inherit vacation_plan permissions"
  ON public.vacation_splits FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.vacation_plans vp
      WHERE vp.id = vacation_splits.vacation_plan_id
        AND (vp.created_by = auth.uid() OR vp.staff_id = auth.uid())
    )
  );

-- RLS Policies for vacation_approvals
CREATE POLICY "Approvers can manage their approvals"
  ON public.vacation_approvals FOR ALL
  USING (approver_id = auth.uid())
  WITH CHECK (approver_id = auth.uid());

CREATE POLICY "Users can view approvals in their scope"
  ON public.vacation_approvals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.vacation_plans vp
      WHERE vp.id = vacation_approvals.vacation_plan_id
        AND (vp.created_by = auth.uid() OR vp.staff_id = auth.uid())
    )
  );

-- RLS Policies for tasks
CREATE POLICY "Users can create tasks based on role"
  ON public.tasks FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND (
          (ur.role = 'workplace_supervisor'::app_role AND scope_type = 'workspace' AND workspace_id = ur.workspace_id) OR
          (ur.role = 'facility_supervisor'::app_role AND scope_type = 'facility' AND facility_id = ur.facility_id) OR
          (ur.role = 'department_head'::app_role AND scope_type = 'department' AND department_id = ur.department_id)
        )
    )
  );

CREATE POLICY "Users can view tasks in their scope"
  ON public.tasks FOR SELECT
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.task_id = tasks.id AND ta.assigned_to = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() 
        AND (
          ur.role = 'super_admin'::app_role OR
          (ur.role = 'workplace_supervisor'::app_role AND workspace_id = ur.workspace_id) OR
          (ur.role = 'facility_supervisor'::app_role AND facility_id = ur.facility_id) OR
          (ur.role = 'department_head'::app_role AND department_id = ur.department_id)
        )
    )
  );

CREATE POLICY "Task creators can update their tasks"
  ON public.tasks FOR UPDATE
  USING (created_by = auth.uid());

-- RLS Policies for task_assignments
CREATE POLICY "Task creators can create assignments"
  ON public.task_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignments.task_id AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can view their assignments"
  ON public.task_assignments FOR SELECT
  USING (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_assignments.task_id AND t.created_by = auth.uid()
    )
  );

CREATE POLICY "Assigned users can update their assignments"
  ON public.task_assignments FOR UPDATE
  USING (assigned_to = auth.uid());

-- Triggers for updated_at
CREATE TRIGGER update_vacation_types_updated_at
  BEFORE UPDATE ON public.vacation_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vacation_plans_updated_at
  BEFORE UPDATE ON public.vacation_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vacation_approvals_updated_at
  BEFORE UPDATE ON public.vacation_approvals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_task_assignments_updated_at
  BEFORE UPDATE ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default vacation types
INSERT INTO public.vacation_types (name, description, max_days) VALUES
('Annual Leave', 'Regular annual vacation leave', 30),
('Sick Leave', 'Medical sick leave', 15),
('Emergency Leave', 'Emergency family situations', 5),
('Hajj Leave', 'Pilgrimage leave', 20),
('Maternity Leave', 'Maternity leave for mothers', 90),
('Paternity Leave', 'Paternity leave for fathers', 5);