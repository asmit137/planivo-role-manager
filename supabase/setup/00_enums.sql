-- STEP 0: ENUMS AND GLOBAL TYPES
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
        CREATE TYPE public.app_role AS ENUM (
          'super_admin',
          'general_admin', 
          'workplace_supervisor',
          'facility_supervisor',
          'department_head',
          'staff'
        );
    END IF;
END$$;
