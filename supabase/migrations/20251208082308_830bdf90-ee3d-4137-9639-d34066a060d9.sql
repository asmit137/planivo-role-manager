-- Step 1: Create organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- RLS Policy for super admins
CREATE POLICY "Super admins can manage organizations"
ON public.organizations
FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Add organization_id to workspaces table
ALTER TABLE public.workspaces 
ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Create default organization
INSERT INTO public.organizations (name, description)
VALUES ('Default Organization', 'Auto-created default organization for existing workspaces');

-- Update all existing workspaces to belong to the default organization
UPDATE public.workspaces 
SET organization_id = (SELECT id FROM public.organizations WHERE name = 'Default Organization' LIMIT 1);

-- Create trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for better query performance
CREATE INDEX idx_workspaces_organization_id ON public.workspaces(organization_id);

-- Now add the view policy (after column exists)
CREATE POLICY "Users can view their organization"
ON public.organizations
FOR SELECT
USING (
  id IN (
    SELECT DISTINCT w.organization_id 
    FROM workspaces w 
    WHERE w.id IN (SELECT get_user_workspaces(auth.uid()))
  )
);