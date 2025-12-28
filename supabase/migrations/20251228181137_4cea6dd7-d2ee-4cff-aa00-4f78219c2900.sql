-- Subscription Plans Table
CREATE TABLE public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  is_enterprise BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Organization Subscriptions Table
CREATE TABLE public.organization_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing', 'suspended')),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  payment_gateway TEXT,
  payment_gateway_subscription_id TEXT,
  payment_gateway_customer_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Subscription Invoices Table
CREATE TABLE public.subscription_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.organization_subscriptions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'paid', 'failed', 'refunded', 'cancelled')),
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  paid_at TIMESTAMP WITH TIME ZONE,
  pdf_url TEXT,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Subscription Overrides Table
CREATE TABLE public.subscription_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL,
  override_value INTEGER NOT NULL,
  reason TEXT,
  approved_by UUID REFERENCES auth.users(id),
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Subscription Usage Tracking Table
CREATE TABLE public.subscription_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, metric_type)
);

-- Enable RLS on all tables
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_usage ENABLE ROW LEVEL SECURITY;

-- Subscription Plans Policies (public read, super admin manage)
CREATE POLICY "Anyone can view active subscription plans"
  ON public.subscription_plans FOR SELECT
  USING (is_active = true);

CREATE POLICY "Super admins can manage subscription plans"
  ON public.subscription_plans FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Organization Subscriptions Policies
CREATE POLICY "Organization owners can view their subscription"
  ON public.organization_subscriptions FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT DISTINCT w.organization_id FROM public.workspaces w
      WHERE w.id IN (SELECT get_user_workspaces(auth.uid()))
    ) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admins can manage all subscriptions"
  ON public.organization_subscriptions FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Subscription Invoices Policies
CREATE POLICY "Organization members can view their invoices"
  ON public.subscription_invoices FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT DISTINCT w.organization_id FROM public.workspaces w
      WHERE w.id IN (SELECT get_user_workspaces(auth.uid()))
    ) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admins can manage all invoices"
  ON public.subscription_invoices FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Subscription Overrides Policies
CREATE POLICY "Organization owners can view their overrides"
  ON public.subscription_overrides FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    ) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admins can manage all overrides"
  ON public.subscription_overrides FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Subscription Usage Policies
CREATE POLICY "Organization members can view their usage"
  ON public.subscription_usage FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM public.organizations WHERE owner_id = auth.uid()
    ) OR
    organization_id IN (
      SELECT DISTINCT w.organization_id FROM public.workspaces w
      WHERE w.id IN (SELECT get_user_workspaces(auth.uid()))
    ) OR
    has_role(auth.uid(), 'super_admin'::app_role)
  );

CREATE POLICY "Super admins can manage all usage"
  ON public.subscription_usage FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Create updated_at triggers
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_organization_subscriptions_updated_at
  BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_invoices_updated_at
  BEFORE UPDATE ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_overrides_updated_at
  BEFORE UPDATE ON public.subscription_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, slug, description, price_monthly, price_yearly, features, limits, is_popular, display_order) VALUES
(
  'Free',
  'free',
  'Perfect for small teams getting started',
  0,
  0,
  '["1 Workspace", "2 Facilities", "5 Users", "Basic Scheduling", "7-day Audit Logs"]'::jsonb,
  '{"max_workspaces": 1, "max_facilities": 2, "max_users": 5, "max_departments": 5, "max_schedules_per_month": 10, "max_training_events": 5, "audit_log_days": 7, "api_access": false, "priority_support": false}'::jsonb,
  false,
  1
),
(
  'Starter',
  'starter',
  'For growing organizations',
  29,
  290,
  '["3 Workspaces", "10 Facilities", "25 Users", "Full Scheduling", "Vacation Management", "30-day Audit Logs", "Email Support"]'::jsonb,
  '{"max_workspaces": 3, "max_facilities": 10, "max_users": 25, "max_departments": 20, "max_schedules_per_month": 100, "max_training_events": 25, "audit_log_days": 30, "api_access": false, "priority_support": false}'::jsonb,
  false,
  2
),
(
  'Professional',
  'professional',
  'For established organizations needing more power',
  79,
  790,
  '["10 Workspaces", "50 Facilities", "100 Users", "Advanced Analytics", "Task Management", "Training Module", "1-year Audit Logs", "Priority Email Support"]'::jsonb,
  '{"max_workspaces": 10, "max_facilities": 50, "max_users": 100, "max_departments": 100, "max_schedules_per_month": 500, "max_training_events": -1, "audit_log_days": 365, "api_access": true, "priority_support": true}'::jsonb,
  true,
  3
),
(
  'Institution',
  'institution',
  'For large institutions with complex needs',
  199,
  1990,
  '["25 Workspaces", "150 Facilities", "500 Users", "All Features", "Custom Integrations", "Dedicated Support", "Unlimited Audit Logs"]'::jsonb,
  '{"max_workspaces": 25, "max_facilities": 150, "max_users": 500, "max_departments": -1, "max_schedules_per_month": -1, "max_training_events": -1, "audit_log_days": -1, "api_access": true, "priority_support": true}'::jsonb,
  false,
  4
),
(
  'Enterprise',
  'enterprise',
  'Custom solutions for enterprise organizations',
  0,
  0,
  '["Unlimited Everything", "White-label Options", "Custom Development", "24/7 Dedicated Support", "SLA Guarantee", "On-premise Option"]'::jsonb,
  '{"max_workspaces": -1, "max_facilities": -1, "max_users": -1, "max_departments": -1, "max_schedules_per_month": -1, "max_training_events": -1, "audit_log_days": -1, "api_access": true, "priority_support": true}'::jsonb,
  false,
  5
);

UPDATE public.subscription_plans SET is_enterprise = true WHERE slug = 'enterprise';