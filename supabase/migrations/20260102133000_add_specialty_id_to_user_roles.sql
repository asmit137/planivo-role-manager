-- Add specialty_id column to user_roles table
-- This column is required for assigning specialties (sub-departments) to users
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS specialty_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';
