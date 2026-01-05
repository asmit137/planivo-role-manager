-- PART 1: Update the enum type
-- This MUST be run and committed before PART 2 can be executed.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'organization_admin';
