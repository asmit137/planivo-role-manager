-- Add is_active column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN is_active boolean DEFAULT true NOT NULL;