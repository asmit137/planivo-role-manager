-- STEP 8: FINAL SEEDS AND TEMPLATE DATA

-- Insert default vacation types
INSERT INTO public.vacation_types (name, description, max_days) VALUES
('Annual Leave', 'Regular annual vacation leave', 30),
('Sick Leave', 'Medical sick leave', 15),
('Emergency Leave', 'Emergency family situations', 5),
('Hajj Leave', 'Pilgrimage leave', 20),
('Maternity Leave', 'Maternity leave for mothers', 90),
('Paternity Leave', 'Paternity leave for fathers', 5)
ON CONFLICT DO NOTHING;

-- INSERT MEDICAL DEPARTMENTS (Templates)
-- Note: These use the first facility as a target if one exists
DO $$
DECLARE
    target_facility_id uuid;
BEGIN
    SELECT id INTO target_facility_id FROM public.facilities LIMIT 1;
    
    IF target_facility_id IS NOT NULL THEN
        INSERT INTO public.departments (name, category, facility_id, min_staffing)
        VALUES 
        ('Emergency Department', 'medical', target_facility_id, 5),
        ('Surgery', 'medical', target_facility_id, 8),
        ('Intensive Care Unit (ICU)', 'medical', target_facility_id, 6),
        ('Cardiology', 'medical', target_facility_id, 4),
        ('Pediatrics', 'medical', target_facility_id, 5),
        ('Radiology', 'medical', target_facility_id, 3),
        ('Pharmacy', 'medical', target_facility_id, 3)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- ADD INDICES
CREATE INDEX IF NOT EXISTS idx_departments_category ON public.departments(category);
CREATE INDEX IF NOT EXISTS idx_workspaces_organization_id ON public.workspaces(organization_id);
