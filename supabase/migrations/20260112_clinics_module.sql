-- Create clinics table
CREATE TABLE IF NOT EXISTS public.clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    location TEXT,
    color TEXT DEFAULT '#10b981', -- Default emerald
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create clinic_assignments table
CREATE TABLE IF NOT EXISTS public.clinic_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'scheduled', -- scheduled, completed, cancelled
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Ensure start is before end
    CONSTRAINT start_before_end CHECK (start_time < end_time)
);

-- Enable RLS
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clinics
CREATE POLICY "Users can view clinics in their organization"
    ON public.clinics FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND organization_id = clinics.organization_id
        )
    );

CREATE POLICY "Admins can manage clinics in their organization"
    ON public.clinics FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND organization_id = clinics.organization_id
            AND role IN ('super_admin', 'organization_admin')
        )
    );

-- RLS Policies for clinic_assignments
CREATE POLICY "Users can view relevant clinic assignments"
    ON public.clinic_assignments FOR SELECT
    USING (
        auth.uid() = staff_id OR
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND organization_id = (SELECT organization_id FROM public.clinics WHERE id = clinic_assignments.clinic_id)
        )
    );

CREATE POLICY "Admins can manage clinic assignments"
    ON public.clinic_assignments FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid()
            AND organization_id = (SELECT organization_id FROM public.clinics WHERE id = clinic_assignments.clinic_id)
            AND role IN ('super_admin', 'organization_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head')
        )
    );

-- Function to check staff availability for clinics (including vacation check)
CREATE OR REPLACE FUNCTION public.check_staff_clinic_availability(
    p_staff_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ
)
RETURNS TABLE (
    is_available BOOLEAN,
    conflict_type TEXT,
    conflict_description TEXT
) AS $$
BEGIN
    -- 1. Check for overlapping vacation plans
    IF EXISTS (
        SELECT 1 
        FROM public.vacation_plans vp
        JOIN public.vacation_splits vs ON vp.id = vs.vacation_plan_id
        WHERE vp.staff_id = p_staff_id
        AND vp.status IN ('approved', 'pending_approval', 'department_pending', 'facility_pending', 'workspace_pending')
        AND (
            (vs.start_date <= p_start_time::date AND vs.end_date >= p_start_time::date) OR
            (vs.start_date <= p_end_time::date AND vs.end_date >= p_end_time::date) OR
            (vs.start_date >= p_start_time::date AND vs.end_date <= p_end_time::date)
        )
    ) THEN
        RETURN QUERY SELECT false, 'vacation', 'Staff member is on vacation during this time.';
        RETURN;
    END IF;

    -- 2. Check for overlapping clinic assignments
    IF EXISTS (
        SELECT 1 
        FROM public.clinic_assignments
        WHERE staff_id = p_staff_id
        AND status = 'scheduled'
        AND (
            (start_time, end_time) OVERLAPS (p_start_time, p_end_time)
        )
    ) THEN
        RETURN QUERY SELECT false, 'clinic_conflict', 'Staff member has another clinic assignment at this time.';
        RETURN;
    END IF;

    -- 3. Check for overlapping shift assignments (if shifts are considered exclusive)
    -- This assumes shift assignments also use start/end times or dates.
    -- Assuming shifts are mostly whole-day or specific times.

    RETURN QUERY SELECT true, NULL, NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
