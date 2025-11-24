-- Add category field to departments table
ALTER TABLE public.departments ADD COLUMN category TEXT;

-- Create index for better performance on category searches
CREATE INDEX idx_departments_category ON public.departments(category);

-- Insert preset medical departments with subdepartments
-- Note: These will be template departments that can be assigned to facilities

-- Emergency Department
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Emergency Department', 'medical', id, 5
FROM public.facilities LIMIT 1;

-- Surgery Department with subdepartments
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Surgery', 'medical', id, 8
FROM public.facilities LIMIT 1;

-- ICU (Intensive Care Unit)
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Intensive Care Unit (ICU)', 'medical', id, 6
FROM public.facilities LIMIT 1;

-- Cardiology
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Cardiology', 'medical', id, 4
FROM public.facilities LIMIT 1;

-- Pediatrics
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Pediatrics', 'medical', id, 5
FROM public.facilities LIMIT 1;

-- Radiology
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Radiology', 'medical', id, 3
FROM public.facilities LIMIT 1;

-- Neurology
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Neurology', 'medical', id, 4
FROM public.facilities LIMIT 1;

-- Oncology
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Oncology', 'medical', id, 4
FROM public.facilities LIMIT 1;

-- Orthopedics
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Orthopedics', 'medical', id, 4
FROM public.facilities LIMIT 1;

-- Laboratory Services
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Laboratory Services', 'medical', id, 3
FROM public.facilities LIMIT 1;

-- Pharmacy
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Pharmacy', 'medical', id, 3
FROM public.facilities LIMIT 1;

-- Obstetrics and Gynecology
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Obstetrics and Gynecology', 'medical', id, 5
FROM public.facilities LIMIT 1;

-- Anesthesiology
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Anesthesiology', 'medical', id, 4
FROM public.facilities LIMIT 1;

-- Psychiatry
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Psychiatry', 'medical', id, 3
FROM public.facilities LIMIT 1;

-- Dermatology
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Dermatology', 'medical', id, 2
FROM public.facilities LIMIT 1;

-- Insert medical subdepartments
-- Surgery subdepartments
INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'General Surgery', 'medical', d.facility_id, d.id, 3
FROM public.departments d
WHERE d.name = 'Surgery' AND d.category = 'medical' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Cardiovascular Surgery', 'medical', d.facility_id, d.id, 4
FROM public.departments d
WHERE d.name = 'Surgery' AND d.category = 'medical' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Neurosurgery', 'medical', d.facility_id, d.id, 4
FROM public.departments d
WHERE d.name = 'Surgery' AND d.category = 'medical' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Plastic Surgery', 'medical', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Surgery' AND d.category = 'medical' LIMIT 1;

-- ICU subdepartments
INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Medical ICU', 'medical', d.facility_id, d.id, 3
FROM public.departments d
WHERE d.name = 'Intensive Care Unit (ICU)' AND d.category = 'medical' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Surgical ICU', 'medical', d.facility_id, d.id, 3
FROM public.departments d
WHERE d.name = 'Intensive Care Unit (ICU)' AND d.category = 'medical' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Neonatal ICU', 'medical', d.facility_id, d.id, 4
FROM public.departments d
WHERE d.name = 'Intensive Care Unit (ICU)' AND d.category = 'medical' LIMIT 1;

-- Radiology subdepartments
INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'X-Ray', 'medical', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Radiology' AND d.category = 'medical' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'MRI', 'medical', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Radiology' AND d.category = 'medical' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'CT Scan', 'medical', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Radiology' AND d.category = 'medical' LIMIT 1;

-- Engineering departments
-- Software Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Software Engineering', 'engineering', id, 5
FROM public.facilities LIMIT 1;

-- Mechanical Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Mechanical Engineering', 'engineering', id, 4
FROM public.facilities LIMIT 1;

-- Electrical Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Electrical Engineering', 'engineering', id, 4
FROM public.facilities LIMIT 1;

-- Civil Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Civil Engineering', 'engineering', id, 4
FROM public.facilities LIMIT 1;

-- Chemical Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Chemical Engineering', 'engineering', id, 3
FROM public.facilities LIMIT 1;

-- Industrial Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Industrial Engineering', 'engineering', id, 3
FROM public.facilities LIMIT 1;

-- Aerospace Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Aerospace Engineering', 'engineering', id, 3
FROM public.facilities LIMIT 1;

-- Biomedical Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Biomedical Engineering', 'engineering', id, 3
FROM public.facilities LIMIT 1;

-- Environmental Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Environmental Engineering', 'engineering', id, 3
FROM public.facilities LIMIT 1;

-- Computer Engineering
INSERT INTO public.departments (name, category, facility_id, min_staffing)
SELECT 'Computer Engineering', 'engineering', id, 4
FROM public.facilities LIMIT 1;

-- Insert engineering subdepartments
-- Software Engineering subdepartments
INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Frontend Development', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Software Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Backend Development', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Software Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'DevOps', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Software Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Quality Assurance', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Software Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Mobile Development', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Software Engineering' AND d.category = 'engineering' LIMIT 1;

-- Mechanical Engineering subdepartments
INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Design Engineering', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Mechanical Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Manufacturing', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Mechanical Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Thermal Systems', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Mechanical Engineering' AND d.category = 'engineering' LIMIT 1;

-- Electrical Engineering subdepartments
INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Power Systems', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Electrical Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Control Systems', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Electrical Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Electronics', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Electrical Engineering' AND d.category = 'engineering' LIMIT 1;

-- Civil Engineering subdepartments
INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Structural Engineering', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Civil Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Transportation Engineering', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Civil Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Geotechnical Engineering', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Civil Engineering' AND d.category = 'engineering' LIMIT 1;

INSERT INTO public.departments (name, category, facility_id, parent_department_id, min_staffing)
SELECT 'Water Resources', 'engineering', d.facility_id, d.id, 2
FROM public.departments d
WHERE d.name = 'Civil Engineering' AND d.category = 'engineering' LIMIT 1;