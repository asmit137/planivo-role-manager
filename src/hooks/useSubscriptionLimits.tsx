import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSubscription } from "./useSubscription";
import { toast } from "sonner";

interface UsageMetrics {
  workspaces: number;
  facilities: number;
  users: number;
  departments: number;
  schedulesThisMonth: number;
  trainingEvents: number;
}

export function useSubscriptionLimits(organizationId?: string) {
  const { effectiveLimits, subscription, isFreePlan } = useSubscription(organizationId);

  const { data: usage, isLoading: usageLoading, refetch: refetchUsage } = useQuery({
    queryKey: ["subscription-usage", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;

      // Fetch current usage counts from the database
      const [workspacesRes, facilitiesRes, usersRes, departmentsRes] = await Promise.all([
        supabase
          .from("workspaces")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId),
        supabase
          .from("facilities")
          .select("id", { count: "exact", head: true })
          .in("workspace_id", 
            (await supabase
              .from("workspaces")
              .select("id")
              .eq("organization_id", organizationId)
            ).data?.map(w => w.id) || []
          ),
        supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .in("workspace_id",
            (await supabase
              .from("workspaces")
              .select("id")
              .eq("organization_id", organizationId)
            ).data?.map(w => w.id) || []
          ),
        supabase
          .from("departments")
          .select("id", { count: "exact", head: true })
          .eq("is_template", false),
      ]);

      return {
        workspaces: workspacesRes.count || 0,
        facilities: facilitiesRes.count || 0,
        users: usersRes.count || 0,
        departments: departmentsRes.count || 0,
        schedulesThisMonth: 0, // Would need additional tracking
        trainingEvents: 0, // Would need additional tracking
      } as UsageMetrics;
    },
    enabled: !!organizationId,
  });

  const checkLimit = (
    limitType: keyof UsageMetrics,
    attemptedAddition: number = 1
  ): { allowed: boolean; message?: string; remaining?: number } => {
    const limitKey = `max_${limitType}` as string;
    const limit = effectiveLimits[limitKey];
    const currentUsage = usage?.[limitType] || 0;

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true };
    }

    if (limit === undefined || limit === null) {
      return { allowed: true };
    }

    const remaining = limit - currentUsage;
    const allowed = remaining >= attemptedAddition;

    if (!allowed) {
      return {
        allowed: false,
        message: `You've reached your ${limitType} limit (${limit}). Please upgrade your plan to add more.`,
        remaining: Math.max(0, remaining),
      };
    }

    return { allowed: true, remaining };
  };

  const enforceLimit = (
    limitType: keyof UsageMetrics,
    attemptedAddition: number = 1
  ): boolean => {
    const result = checkLimit(limitType, attemptedAddition);
    
    if (!result.allowed && result.message) {
      toast.error("Limit Reached", {
        description: result.message,
      });
    }

    return result.allowed;
  };

  const getUsagePercentage = (limitType: keyof UsageMetrics): number => {
    const limitKey = `max_${limitType}` as string;
    const limit = effectiveLimits[limitKey];
    const currentUsage = usage?.[limitType] || 0;

    if (limit === -1 || !limit) return 0;
    return Math.min(100, Math.round((currentUsage / limit) * 100));
  };

  const isNearLimit = (limitType: keyof UsageMetrics, threshold: number = 80): boolean => {
    return getUsagePercentage(limitType) >= threshold;
  };

  const isAtLimit = (limitType: keyof UsageMetrics): boolean => {
    return getUsagePercentage(limitType) >= 100;
  };

  return {
    usage,
    limits: effectiveLimits,
    isLoading: usageLoading,
    checkLimit,
    enforceLimit,
    getUsagePercentage,
    isNearLimit,
    isAtLimit,
    refetchUsage,
    isFreePlan,
    planName: subscription?.plan?.name || "Free",
  };
}
