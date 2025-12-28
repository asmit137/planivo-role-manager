import { useState } from "react";
import { Check, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";

interface Plan {
  name: string;
  slug: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  isPopular?: boolean;
  isEnterprise?: boolean;
}

const plans: Plan[] = [
  {
    name: "Free",
    slug: "free",
    description: "Perfect for small teams getting started",
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      "1 Workspace",
      "2 Facilities",
      "5 Users",
      "Basic Scheduling",
      "7-day Audit Logs",
    ],
  },
  {
    name: "Starter",
    slug: "starter",
    description: "For growing organizations",
    priceMonthly: 29,
    priceYearly: 290,
    features: [
      "3 Workspaces",
      "10 Facilities",
      "25 Users",
      "Full Scheduling",
      "Vacation Management",
      "30-day Audit Logs",
      "Email Support",
    ],
  },
  {
    name: "Professional",
    slug: "professional",
    description: "For established organizations",
    priceMonthly: 79,
    priceYearly: 790,
    features: [
      "10 Workspaces",
      "50 Facilities",
      "100 Users",
      "Advanced Analytics",
      "Task Management",
      "Training Module",
      "1-year Audit Logs",
      "Priority Support",
    ],
    isPopular: true,
  },
  {
    name: "Institution",
    slug: "institution",
    description: "For large institutions",
    priceMonthly: 199,
    priceYearly: 1990,
    features: [
      "25 Workspaces",
      "150 Facilities",
      "500 Users",
      "All Features",
      "Custom Integrations",
      "Dedicated Support",
      "Unlimited Audit Logs",
    ],
  },
  {
    name: "Enterprise",
    slug: "enterprise",
    description: "Custom solutions for enterprise",
    priceMonthly: 0,
    priceYearly: 0,
    features: [
      "Unlimited Everything",
      "White-label Options",
      "Custom Development",
      "24/7 Dedicated Support",
      "SLA Guarantee",
      "On-premise Option",
    ],
    isEnterprise: true,
  },
];

export function PricingSection() {
  const [isYearly, setIsYearly] = useState(false);

  const getPrice = (plan: Plan) => {
    if (plan.isEnterprise) return "Custom";
    const price = isYearly ? plan.priceYearly : plan.priceMonthly;
    if (price === 0) return "Free";
    return `$${price}`;
  };

  const getPeriod = (plan: Plan) => {
    if (plan.isEnterprise || plan.priceMonthly === 0) return "";
    return isYearly ? "/year" : "/month";
  };

  const getSavings = (plan: Plan) => {
    if (plan.priceMonthly === 0 || plan.isEnterprise) return null;
    const yearlyCost = plan.priceMonthly * 12;
    const savings = yearlyCost - plan.priceYearly;
    const percentage = Math.round((savings / yearlyCost) * 100);
    return percentage;
  };

  return (
    <section className="py-20 md:py-32" id="pricing">
      <div className="container mx-auto px-4">
        {/* Section header */}
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Pricing
          </span>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
            Simple, Transparent Pricing
          </h2>
          <p className="text-lg text-muted-foreground">
            Choose the plan that fits your organization. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="mb-12 flex items-center justify-center gap-4">
          <Label htmlFor="billing" className={!isYearly ? "font-semibold" : "text-muted-foreground"}>
            Monthly
          </Label>
          <Switch
            id="billing"
            checked={isYearly}
            onCheckedChange={setIsYearly}
          />
          <Label htmlFor="billing" className={isYearly ? "font-semibold" : "text-muted-foreground"}>
            Yearly
            <Badge variant="secondary" className="ml-2 bg-success/10 text-success">
              Save up to 17%
            </Badge>
          </Label>
        </div>

        {/* Pricing cards */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {plans.map((plan) => (
            <Card
              key={plan.slug}
              className={`relative flex flex-col transition-all ${
                plan.isPopular
                  ? "border-primary shadow-lg shadow-primary/10 ring-2 ring-primary"
                  : "border-border/50 hover:border-primary/30 hover:shadow-md"
              }`}
            >
              {plan.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="gap-1 bg-primary text-primary-foreground">
                    <Sparkles className="h-3 w-3" />
                    Most Popular
                  </Badge>
                </div>
              )}

              <CardHeader className="pb-4">
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>

              <CardContent className="flex-1 pb-6">
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">{getPrice(plan)}</span>
                  <span className="text-muted-foreground">{getPeriod(plan)}</span>
                  {isYearly && getSavings(plan) && (
                    <p className="mt-1 text-sm text-success">
                      Save {getSavings(plan)}% with yearly billing
                    </p>
                  )}
                </div>

                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <span className="text-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                {plan.isEnterprise ? (
                  <Button
                    asChild
                    className="w-full"
                    variant="outline"
                  >
                    <a href="mailto:sales@planivo.com">Contact Sales</a>
                  </Button>
                ) : (
                  <Button
                    asChild
                    className="w-full"
                    variant={plan.isPopular ? "default" : "outline"}
                  >
                    <Link to="/auth">
                      {plan.priceMonthly === 0 ? "Get Started Free" : "Start Free Trial"}
                    </Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* FAQ note */}
        <p className="mt-12 text-center text-sm text-muted-foreground">
          All paid plans include a 14-day free trial. No credit card required.
        </p>
      </div>
    </section>
  );
}
