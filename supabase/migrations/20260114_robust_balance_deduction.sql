-- Migration: Robust Vacation Balance Deduction
-- Description: Centralizes all balance deduction in the DB. 
-- Ensures consistency and fixes frontend dependency on existing records.

CREATE OR REPLACE FUNCTION public.handle_vacation_approval_balance_deduction()
RETURNS TRIGGER AS $$
DECLARE
    org_mode text;
    v_year integer;
    v_org_id uuid;
    v_max_days numeric;
BEGIN
    -- Only act if status changed to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        
        -- 1. Resolve organization_id through hierarchy (Robust resolution)
        -- Priority: 1. From department, 2. From facility, 3. From workspace
        SELECT w.organization_id INTO v_org_id
        FROM public.departments d
        JOIN public.facilities f ON f.id = d.facility_id
        JOIN public.workspaces w ON w.id = f.workspace_id
        WHERE d.id = NEW.department_id;

        IF v_org_id IS NULL THEN
            -- Fallback if department record is missing/orphaned
            RAISE NOTICE 'Hierarchy resolution failed for plan %. Skipping deduction.', NEW.id;
            RETURN NEW;
        END IF;

        -- 2. Get organization vacation mode
        SELECT vacation_mode INTO org_mode FROM public.organizations WHERE id = v_org_id;

        -- 3. Only deduct if in 'full' mode
        IF org_mode = 'full' THEN
            v_year := EXTRACT(YEAR FROM CURRENT_DATE);
            
            -- Get default max days for this type
            SELECT max_days INTO v_max_days FROM public.vacation_types WHERE id = NEW.vacation_type_id;

            -- 4. Upsert balance record and update
            -- We use EXCLUDED.used because that represents the total_days from the new plan
            INSERT INTO public.leave_balances (
                staff_id, 
                vacation_type_id, 
                organization_id, 
                balance, 
                accrued, 
                used, 
                year
            )
            VALUES (
                NEW.staff_id, 
                NEW.vacation_type_id, 
                v_org_id,
                COALESCE(v_max_days, 30) - NEW.total_days, -- Initial balance
                COALESCE(v_max_days, 30),                  -- Initial accrued
                NEW.total_days,                            -- Initial used
                v_year
            )
            ON CONFLICT (staff_id, vacation_type_id, year) 
            DO UPDATE SET 
                used = public.leave_balances.used + EXCLUDED.used,
                balance = public.leave_balances.accrued - (public.leave_balances.used + EXCLUDED.used),
                updated_at = now();
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure trigger is attached
DROP TRIGGER IF EXISTS on_vacation_approval_deduct_balance ON public.vacation_plans;
CREATE TRIGGER on_vacation_approval_deduct_balance
    AFTER UPDATE ON public.vacation_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_vacation_approval_balance_deduction();

-- Force schema reload
NOTIFY pgrst, 'reload schema';
