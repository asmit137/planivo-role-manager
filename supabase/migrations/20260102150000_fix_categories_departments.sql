-- ================================================================
-- FIX CATEGORIES AND DEPARTMENTS SCHEMA
-- ================================================================

-- 1. Create 'categories' table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- 2. Modify 'departments' table to support templates
-- Allow facility_id to be NULL (for global templates)
ALTER TABLE public.departments ALTER COLUMN facility_id DROP NOT NULL;

-- Add category column (if connected to categories)
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS category TEXT;

-- Add is_template flag
ALTER TABLE public.departments ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false;

-- 3. RLS Policies for Categories

-- Everyone can view active categories
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;
CREATE POLICY "Authenticated users can view categories"
  ON public.categories FOR SELECT
  USING (true);

-- Only admins can manage categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories"
  ON public.categories FOR ALL
  USING (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'organization_admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin') OR
    public.has_role(auth.uid(), 'organization_admin')
  );

-- 4. Update RLS Policies for Departments to handle templates

-- Templates are viewable by everyone
DROP POLICY IF EXISTS "View template departments" ON public.departments;
CREATE POLICY "View template departments"
  ON public.departments FOR SELECT
  USING (is_template = true);

-- Templates can only be managed by admins
DROP POLICY IF EXISTS "Admins manage template departments" ON public.departments;
CREATE POLICY "Admins manage template departments"
  ON public.departments FOR ALL
  USING (
    is_template = true AND (
      public.has_role(auth.uid(), 'super_admin') OR
      public.has_role(auth.uid(), 'organization_admin')
    )
  )
  WITH CHECK (
    is_template = true AND (
      public.has_role(auth.uid(), 'super_admin') OR
      public.has_role(auth.uid(), 'organization_admin')
    )
  );

-- Refresh schema cache
NOTIFY pgrst, 'reload schema';
