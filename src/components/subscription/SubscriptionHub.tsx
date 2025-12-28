import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  CreditCard, 
  Receipt, 
  TrendingUp, 
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Calendar,
  Building2,
  Users,
  Briefcase,
} from "lucide-react";
import { format } from "date-fns";
import { useSubscription } from "@/hooks/useSubscription";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { InvoicesList } from "./InvoicesList";
import { UsageMeters } from "./UsageMeters";

interface SubscriptionHubProps {
  organizationId: string;
}

export function SubscriptionHub({ organizationId }: SubscriptionHubProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const { subscription, plans, isLoading, isFreePlan, isTrialing, isPastDue } = useSubscription(organizationId);
  const { usage, limits, getUsagePercentage } = useSubscriptionLimits(organizationId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const currentPlan = subscription?.plan;
  const statusColors = {
    active: "bg-success/10 text-success",
    trialing: "bg-warning/10 text-warning",
    past_due: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
    suspended: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="space-y-6">
      {/* Current Plan Overview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Plan
            </CardTitle>
            <CardDescription>
              Your subscription details and billing information
            </CardDescription>
          </div>
          {subscription && (
            <Badge className={statusColors[subscription.status as keyof typeof statusColors] || "bg-muted"}>
              {subscription.status.replace("_", " ").toUpperCase()}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Plan</p>
              <p className="text-2xl font-bold">{currentPlan?.name || "Free"}</p>
              {currentPlan?.is_popular && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  Most Popular
                </Badge>
              )}
            </div>
            
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Billing Cycle</p>
              <p className="text-2xl font-bold capitalize">
                {subscription?.billing_cycle || "N/A"}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Next Billing</p>
              <p className="text-2xl font-bold">
                {subscription?.current_period_end
                  ? format(new Date(subscription.current_period_end), "MMM d, yyyy")
                  : "N/A"}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Monthly Cost</p>
              <p className="text-2xl font-bold">
                {currentPlan?.price_monthly === 0 
                  ? "Free" 
                  : `$${currentPlan?.price_monthly || 0}`}
              </p>
            </div>
          </div>

          {/* Alerts */}
          {isPastDue && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span>Your payment is past due. Please update your payment method to avoid service interruption.</span>
              <Button variant="destructive" size="sm" className="ml-auto">
                Update Payment
              </Button>
            </div>
          )}

          {isTrialing && subscription?.trial_ends_at && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 p-4 text-warning">
              <Clock className="h-5 w-5" />
              <span>
                Your trial ends on {format(new Date(subscription.trial_ends_at), "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="sm" className="ml-auto">
                Add Payment Method
              </Button>
            </div>
          )}

          {isFreePlan && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-primary/50 bg-primary/10 p-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="text-foreground">
                Upgrade to unlock more features and higher limits
              </span>
              <Button size="sm" className="ml-auto gap-1">
                View Plans
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Usage Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="plans">Compare Plans</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <UsageMeters organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesList organizationId={organizationId} />
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {plans?.map((plan) => (
              <Card 
                key={plan.id}
                className={`relative ${
                  currentPlan?.id === plan.id 
                    ? "border-primary ring-2 ring-primary" 
                    : ""
                }`}
              >
                {plan.is_popular && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                    Most Popular
                  </Badge>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4">
                    <span className="text-3xl font-bold">
                      {plan.price_monthly === 0 ? "Free" : `$${plan.price_monthly}`}
                    </span>
                    {plan.price_monthly > 0 && (
                      <span className="text-muted-foreground">/month</span>
                    )}
                  </div>
                  <ul className="space-y-2 text-sm">
                    {(plan.features as string[]).map((feature, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button 
                    className="mt-4 w-full" 
                    variant={currentPlan?.id === plan.id ? "outline" : "default"}
                    disabled={currentPlan?.id === plan.id}
                  >
                    {currentPlan?.id === plan.id ? "Current Plan" : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
