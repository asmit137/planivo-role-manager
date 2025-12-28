import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Building2, 
  Users, 
  Briefcase, 
  FolderTree,
  Calendar,
  GraduationCap,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";

interface UsageMetersProps {
  organizationId: string;
}

const metrics = [
  { key: "workspaces", label: "Workspaces", icon: Building2, color: "bg-primary" },
  { key: "facilities", label: "Facilities", icon: Briefcase, color: "bg-accent" },
  { key: "users", label: "Users", icon: Users, color: "bg-success" },
  { key: "departments", label: "Departments", icon: FolderTree, color: "bg-warning" },
  { key: "schedulesThisMonth", label: "Schedules (Monthly)", icon: Calendar, color: "bg-primary" },
  { key: "trainingEvents", label: "Training Events", icon: GraduationCap, color: "bg-accent" },
] as const;

export function UsageMeters({ organizationId }: UsageMetersProps) {
  const { 
    usage, 
    limits, 
    getUsagePercentage, 
    isNearLimit, 
    isAtLimit,
    planName,
    isLoading,
  } = useSubscriptionLimits(organizationId);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-24 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const getLimitDisplay = (key: string) => {
    const limitKey = `max_${key}`;
    const limit = limits[limitKey];
    if (limit === -1) return "Unlimited";
    return limit?.toString() || "0";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Resource Usage</h3>
          <p className="text-sm text-muted-foreground">
            Current plan: <span className="font-medium">{planName}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1">
          Need More?
          <ArrowUpRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {metrics.map((metric) => {
          const percentage = getUsagePercentage(metric.key as any);
          const current = usage?.[metric.key as keyof typeof usage] || 0;
          const limit = getLimitDisplay(metric.key);
          const nearLimit = isNearLimit(metric.key as any);
          const atLimit = isAtLimit(metric.key as any);

          return (
            <Card 
              key={metric.key}
              className={`transition-all ${
                atLimit 
                  ? "border-destructive/50 bg-destructive/5" 
                  : nearLimit 
                    ? "border-warning/50 bg-warning/5" 
                    : ""
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg p-2 ${metric.color}/10`}>
                      <metric.icon className={`h-5 w-5 ${metric.color.replace("bg-", "text-")}`} />
                    </div>
                    <div>
                      <p className="font-medium">{metric.label}</p>
                      <p className="text-2xl font-bold">
                        {current}
                        <span className="text-sm font-normal text-muted-foreground">
                          {" / "}{limit}
                        </span>
                      </p>
                    </div>
                  </div>
                  {atLimit && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Limit
                    </Badge>
                  )}
                  {nearLimit && !atLimit && (
                    <Badge variant="secondary" className="gap-1 bg-warning/10 text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      {percentage}%
                    </Badge>
                  )}
                </div>
                <Progress 
                  value={limit === "Unlimited" ? 0 : percentage} 
                  className={`mt-4 h-2 ${
                    atLimit 
                      ? "[&>div]:bg-destructive" 
                      : nearLimit 
                        ? "[&>div]:bg-warning" 
                        : ""
                  }`}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
