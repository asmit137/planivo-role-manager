import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface SubscriptionPlan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  features: string[];
  limits: Record<string, number>;
  is_active: boolean;
  is_popular: boolean;
  is_enterprise: boolean;
  display_order: number;
}

interface OrganizationSubscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: string;
  billing_cycle: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  cancelled_at: string | null;
  plan?: SubscriptionPlan;
}

interface SubscriptionOverride {
  id: string;
  organization_id: string;
  override_type: string;
  override_value: number;
  reason: string | null;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
}

export function useSubscription(organizationId?: string) {
  const { user } = useAuth();

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      
      if (error) throw error;
      return data as SubscriptionPlan[];
    },
  });

  const { data: subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useQuery({
    queryKey: ["organization-subscription", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq("organization_id", organizationId)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return data as OrganizationSubscription | null;
    },
    enabled: !!organizationId && !!user,
  });

  const { data: overrides, isLoading: overridesLoading } = useQuery({
    queryKey: ["subscription-overrides", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from("subscription_overrides")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("is_active", true);
      
      if (error) throw error;
      return data as SubscriptionOverride[];
    },
    enabled: !!organizationId && !!user,
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["subscription-invoices", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      
      const { data, error } = await supabase
        .from("subscription_invoices")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && !!user,
  });

  // Get effective limits (plan limits + overrides)
  const getEffectiveLimits = () => {
    const planLimits = subscription?.plan?.limits || {};
    const effectiveLimits = { ...planLimits };

    overrides?.forEach((override) => {
      if (override.is_active) {
        const now = new Date();
        const validUntil = override.valid_until ? new Date(override.valid_until) : null;
        
        if (!validUntil || validUntil > now) {
          effectiveLimits[override.override_type] = override.override_value;
        }
      }
    });

    return effectiveLimits as Record<string, number>;
  };

  const isFreePlan = !subscription || subscription.plan?.slug === "free";
  const isTrialing = subscription?.status === "trialing";
  const isPastDue = subscription?.status === "past_due";
  const isCancelled = subscription?.status === "cancelled";

  return {
    plans,
    subscription,
    overrides,
    invoices,
    effectiveLimits: getEffectiveLimits(),
    isLoading: plansLoading || subscriptionLoading || overridesLoading || invoicesLoading,
    isFreePlan,
    isTrialing,
    isPastDue,
    isCancelled,
    refetchSubscription,
  };
}
