-- Check user_roles table constraints
SELECT 
    table_name, 
    column_name, 
    is_nullable, 
    data_type
FROM 
    information_schema.columns
WHERE 
    table_name = 'user_roles';

-- Check for existing null facility_ids
SELECT count(*) FROM public.user_roles WHERE facility_id IS NULL;
