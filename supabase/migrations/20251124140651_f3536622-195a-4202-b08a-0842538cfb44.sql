-- Add missing foreign key constraints (skip existing ones)

-- Add foreign key from task_assignments to profiles
ALTER TABLE public.task_assignments
ADD CONSTRAINT task_assignments_assigned_to_fkey
FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add foreign key from vacation_plans to profiles (staff_id)
ALTER TABLE public.vacation_plans
ADD CONSTRAINT vacation_plans_staff_id_fkey
FOREIGN KEY (staff_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add foreign key from vacation_plans to profiles (created_by)
ALTER TABLE public.vacation_plans
ADD CONSTRAINT vacation_plans_created_by_fkey
FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add foreign key from vacation_approvals to profiles (approver_id)
ALTER TABLE public.vacation_approvals
ADD CONSTRAINT vacation_approvals_approver_id_fkey
FOREIGN KEY (approver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- Add foreign key from tasks to profiles (created_by)
ALTER TABLE public.tasks
ADD CONSTRAINT tasks_created_by_fkey
FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;