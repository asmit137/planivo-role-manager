import { useState } from "react";
import { Check, X, Sparkles, Mail, Phone } from "lucide-react";
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
            Custom Solutions for Your Business
          </h2>
          <p className="text-lg text-muted-foreground">
            Get a tailored package that fits your organization's unique needs.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="flex justify-center mb-16">
          {plans.filter(p => p.isEnterprise).map((plan) => (
            <Card
              key={plan.slug}
              className="relative flex flex-col w-full max-w-md border-primary shadow-lg shadow-primary/10 ring-2 ring-primary"
            >
              <CardHeader className="pb-4">
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
              </CardHeader>

              <CardContent className="flex-1 pb-6">
                <div className="mb-6">
                  <span className="text-4xl font-bold text-foreground">{getPrice(plan)}</span>
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
                <Button
                  asChild
                  className="w-full"
                  size="lg"
                >
                  <a href="mailto:sales@planivo.com">Contact Sales</a>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Premium Contact Us Section */}
        <div className="mt-24 relative overflow-hidden rounded-3xl bg-card border border-border p-6 md:p-12 shadow-2xl max-w-4xl mx-auto">
          {/* Background Effects */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />

          <div className="relative z-10 mx-auto max-w-3xl text-center mb-10">
            <h3 className="text-3xl font-bold text-foreground mb-4">Still have questions?</h3>
            <p className="text-lg text-muted-foreground">
              Our team is here to help. Reach out to us for a personalized consultation or technical support.
            </p>
          </div>

          <div className="relative z-10 grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <a
              href="mailto:support@planivo.com"
              className="group relative flex flex-col items-center p-6 rounded-2xl bg-muted/40 hover:bg-muted/80 border border-border transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform duration-300">
                <Mail className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-semibold text-foreground mb-2">Email Support</h4>
              <p className="text-sm text-muted-foreground mb-4">Get a response within 2 hours</p>
              <span className="text-primary text-sm font-medium flex items-center group-hover:underline">
                support@planivo.com
              </span>
            </a>

            <a
              href="tel:+1234567890"
              className="group relative flex flex-col items-center p-6 rounded-2xl bg-muted/40 hover:bg-muted/80 border border-border transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary group-hover:scale-110 transition-transform duration-300">
                <Phone className="h-6 w-6" />
              </div>
              <h4 className="text-xl font-semibold text-foreground mb-2">Call Sales</h4>
              <p className="text-sm text-muted-foreground mb-4">Mon-Fri 9am-6pm EST</p>
              <span className="text-primary text-sm font-medium flex items-center group-hover:underline">
                +1 (555) 123-4567
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
