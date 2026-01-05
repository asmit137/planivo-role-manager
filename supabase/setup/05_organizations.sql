-- STEP 5: ORGANIZATIONS AND HIERARCHY UPDATES

-- ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Super Admin Policy
DROP POLICY IF EXISTS "Super admins can manage organizations" ON public.organizations;
CREATE POLICY "Super admins can manage organizations"
ON public.organizations FOR ALL
USING (has_role(auth.uid(), 'super_admin'))
WITH CHECK (has_role(auth.uid(), 'super_admin'));

-- Link Workspaces to Orgs
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Default Org and Seed
INSERT INTO public.organizations (name, description)
VALUES ('Default Organization', 'Auto-created default organization for existing workspaces')
ON CONFLICT DO NOTHING;

UPDATE public.workspaces 
SET organization_id = (SELECT id FROM public.organizations WHERE name = 'Default Organization' LIMIT 1)
WHERE organization_id IS NULL;

-- Org Trigger
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- View Policy for Orgs
DROP POLICY IF EXISTS "Users can view their organization" ON public.organizations;
CREATE POLICY "Users can view their organization"
ON public.organizations FOR SELECT
USING (
  id IN (
    SELECT DISTINCT w.organization_id 
    FROM workspaces w 
    WHERE w.id IN (SELECT get_user_workspaces(auth.uid()))
  )
);
