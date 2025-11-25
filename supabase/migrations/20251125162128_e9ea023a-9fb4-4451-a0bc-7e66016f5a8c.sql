-- Add foreign key constraint from user_roles to profiles
-- This enables Supabase automatic joins and ensures data integrity
ALTER TABLE public.user_roles 
ADD CONSTRAINT user_roles_user_id_profiles_fkey 
FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;