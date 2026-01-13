-- =====================================================
-- FIX VACATION APPROVAL LOGIC & HIERARCHY
-- =====================================================

-- 1. Add 'intern' and 'workspace_supervisor' to the app_role enum if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'intern') THEN
        ALTER TYPE public.app_role ADD VALUE 'intern';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'app_role' AND e.enumlabel = 'workspace_supervisor') THEN
        ALTER TYPE public.app_role ADD VALUE 'workspace_supervisor';
    END IF;
END$$;

-- 2. Update the approval check function to match new hierarchy
CREATE OR REPLACE FUNCTION public.can_approve_vacation_plan(_plan_id UUID, _user_id UUID)
RETURNS BOOLEAN SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dept_id UUID;
  v_staff_id UUID;
  v_approver_role app_role;
  v_staff_role app_role;
BEGIN
  -- Get plan details
  SELECT department_id, staff_id 
  INTO v_dept_id, v_staff_id
  FROM public.vacation_plans WHERE id = _plan_id;
  
  IF v_dept_id IS NULL THEN RETURN FALSE; END IF;
  
  -- Users cannot approve their own vacations
  IF v_staff_id = _user_id THEN RETURN FALSE; END IF;

  -- Get the role of the person trying to approve (using primary role)
  SELECT role INTO v_approver_role FROM public.user_roles WHERE user_id = _user_id LIMIT 1;
  
  -- SUPER ADMIN can approve EVERYTHING
  IF v_approver_role IN ('super_admin'::app_role, 'organization_admin'::app_role) THEN
    RETURN TRUE;
  END IF;

  -- Get the role of the staff member who made the plan
  SELECT role INTO v_staff_role FROM public.user_roles WHERE user_id = v_staff_id LIMIT 1;

  -- RULE: For regular STAFF and INTERN, any supervisor in the chain can approve
  IF v_staff_role IN ('staff'::app_role, 'intern'::app_role) THEN
    -- Check Scope
    RETURN EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = _user_id
      AND (
        -- Workspace Supervisor / General Admin (Workspace scope)
        (ur.role IN ('general_admin'::app_role, 'workplace_supervisor'::app_role, 'workspace_supervisor'::app_role) AND EXISTS (
          SELECT 1 FROM public.departments d 
          JOIN public.facilities f ON f.id = d.facility_id 
          WHERE d.id = v_dept_id AND f.workspace_id = ur.workspace_id
        )) OR
        -- Facility Supervisor (Facility scope)
        (ur.role = 'facility_supervisor'::app_role AND EXISTS (
          SELECT 1 FROM public.departments d 
          WHERE d.id = v_dept_id AND d.facility_id = ur.facility_id
        )) OR
        -- Department Head (Department scope)
        (ur.role = 'department_head'::app_role AND ur.department_id = v_dept_id)
      )
    );
  END IF;

  -- RULE: For Supervisors (Dept Head, Facility, Workspace), ONLY Super Admin can approve.
  -- Since we already checked Super Admin at the top, if we are here, it means the 
  -- staff member is a supervisor and the approver is not a Super Admin.
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Update vacation_approvals constraint to allow level 1
ALTER TABLE public.vacation_approvals DROP CONSTRAINT IF EXISTS vacation_approvals_approval_level_check;
ALTER TABLE public.vacation_approvals 
ADD CONSTRAINT vacation_approvals_approval_level_check 
CHECK (approval_level IN (1, 2, 3));

-- 4. Update vacation_plans status constraint (already corrected in earlier migration but ensuring here)
ALTER TABLE public.vacation_plans DROP CONSTRAINT IF EXISTS vacation_plans_status_check;
ALTER TABLE public.vacation_plans 
ADD CONSTRAINT vacation_plans_status_check 
CHECK (status IN (
  'draft', 
  'pending_approval', 
  'department_pending', 
  'facility_pending', 
  'workspace_pending', 
  'approved', 
  'rejected', 
  'cancelled'
));

-- 5. Robust balance deduction trigger
CREATE OR REPLACE FUNCTION public.handle_vacation_approval_balance_deduction()
RETURNS TRIGGER AS $$
DECLARE
    org_mode text;
    v_year integer;
    v_org_id uuid;
BEGIN
    -- Only act if status changed to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Resolve organization_id through hierarchy
        SELECT w.organization_id INTO v_org_id
        FROM public.departments d
        JOIN public.facilities f ON f.id = d.facility_id
        JOIN public.workspaces w ON w.id = f.workspace_id
        WHERE d.id = NEW.department_id;

        -- If hierarchy resolution fails, skip deduction instead of failing transaction
        IF v_org_id IS NULL THEN
            RETURN NEW;
        END IF;

        -- Get organization vacation mode
        SELECT vacation_mode INTO org_mode FROM public.organizations WHERE id = v_org_id;

        -- Only deduct if in 'full' mode
        IF org_mode = 'full' THEN
            v_year := EXTRACT(YEAR FROM CURRENT_DATE);

            -- Upsert balance record and update
            INSERT INTO public.leave_balances (staff_id, vacation_type_id, organization_id, balance, accrued, used, year)
            SELECT 
                NEW.staff_id, 
                NEW.vacation_type_id, 
                v_org_id,
                COALESCE((SELECT max_days FROM public.vacation_types WHERE id = NEW.vacation_type_id), 30) - NEW.total_days,
                COALESCE((SELECT max_days FROM public.vacation_types WHERE id = NEW.vacation_type_id), 30),
                NEW.total_days,
                v_year
            ON CONFLICT (staff_id, vacation_type_id, year) DO UPDATE
            SET 
                balance = public.leave_balances.balance - EXCLUDED.used,
                used = public.leave_balances.used + EXCLUDED.used,
                updated_at = now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger should already exist, but let's ensure it's attached
DROP TRIGGER IF EXISTS on_vacation_approval_deduct_balance ON public.vacation_plans;
CREATE TRIGGER on_vacation_approval_deduct_balance
    AFTER UPDATE ON public.vacation_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_vacation_approval_balance_deduction();

-- 6. Notify schema reload
NOTIFY pgrst, 'reload schema';
