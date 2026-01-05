-- Check if is_template column exists and view sample data
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'departments' AND column_name = 'is_template';

SELECT id, name, facility_id, is_template 
FROM public.departments 
LIMIT 5;
