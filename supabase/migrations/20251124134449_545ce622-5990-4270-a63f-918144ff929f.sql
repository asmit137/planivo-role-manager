-- Add force_password_change field to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false;

-- Update existing profiles to not force password change
UPDATE public.profiles SET force_password_change = false WHERE force_password_change IS NULL;