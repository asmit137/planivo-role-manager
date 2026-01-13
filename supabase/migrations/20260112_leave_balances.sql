-- Create leave_balances table
CREATE TABLE IF NOT EXISTS public.leave_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    vacation_type_id UUID NOT NULL REFERENCES public.vacation_types(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    balance NUMERIC NOT NULL DEFAULT 0,
    accrued NUMERIC NOT NULL DEFAULT 0,
    used NUMERIC NOT NULL DEFAULT 0,
    year INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(staff_id, vacation_type_id, year)
);

-- Enable RLS
ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own leave balances"
    ON public.leave_balances FOR SELECT
    USING (auth.uid() = staff_id);

CREATE POLICY "Admins can manage all leave balances in their organization"
    ON public.leave_balances FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND organization_id = leave_balances.organization_id
            AND role IN ('super_admin', 'organization_admin')
        )
    );

-- Function to handle balance deduction on approval
CREATE OR REPLACE FUNCTION public.handle_vacation_approval_balance_deduction()
RETURNS TRIGGER AS $$
DECLARE
    org_mode text;
    v_year integer;
BEGIN
    -- Only act if status changed to 'approved'
    IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
        -- Get organization vacation mode
        SELECT vacation_mode INTO org_mode FROM public.organizations WHERE id = (
            SELECT organization_id FROM public.workspaces WHERE id = (
                SELECT workspace_id FROM public.departments WHERE id = NEW.department_id
            )
        );

        -- Only deduct if in 'full' mode
        IF org_mode = 'full' THEN
            v_year := EXTRACT(YEAR FROM CURRENT_DATE);

            -- Upsert balance record and update
            INSERT INTO public.leave_balances (staff_id, vacation_type_id, organization_id, balance, accrued, used, year)
            SELECT 
                NEW.staff_id, 
                NEW.vacation_type_id, 
                (SELECT organization_id FROM public.workspaces WHERE id = (SELECT workspace_id FROM public.departments WHERE id = NEW.department_id)),
                COALESCE((SELECT max_days FROM public.vacation_types WHERE id = NEW.vacation_type_id), 0) - NEW.total_days,
                COALESCE((SELECT max_days FROM public.vacation_types WHERE id = NEW.vacation_type_id), 0),
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

-- Trigger for vacation balance deduction
DROP TRIGGER IF EXISTS on_vacation_approval_deduct_balance ON public.vacation_plans;
CREATE TRIGGER on_vacation_approval_deduct_balance
    AFTER UPDATE ON public.vacation_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_vacation_approval_balance_deduction();
