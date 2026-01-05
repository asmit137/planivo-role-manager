-- STEP 4: MODULES (Vacation & Task Management)

-- VACATION TYPES
CREATE TABLE IF NOT EXISTS public.vacation_types (
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

-- VACATION PLANS
CREATE TABLE IF NOT EXISTS public.vacation_plans (
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

-- VACATION SPLITS
CREATE TABLE IF NOT EXISTS public.vacation_splits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vacation_plan_id UUID NOT NULL REFERENCES public.vacation_plans(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- VACATION APPROVALS
CREATE TABLE IF NOT EXISTS public.vacation_approvals (
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

-- TASKS
CREATE TABLE IF NOT EXISTS public.tasks (
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

-- TASK ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.task_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vacation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vacation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
