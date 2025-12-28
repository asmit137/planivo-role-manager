import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Building2, 
  CreditCard, 
  Search,
  Filter,
  MoreHorizontal,
  Receipt,
  Settings2,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { PlanEditor } from "./PlanEditor";
import { OverridesManager } from "./OverridesManager";

export function SubscriptionManagement() {
  const [activeTab, setActiveTab] = useState("subscriptions");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data: subscriptions, isLoading } = useQuery({
    queryKey: ["all-organization-subscriptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organization_subscriptions")
        .select(`
          *,
          organization:organizations(id, name),
          plan:subscription_plans(id, name, slug, price_monthly)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("is_active", true)
        .order("display_order");
      
      if (error) throw error;
      return data;
    },
  });

  const updateSubscription = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from("organization_subscriptions")
        .update(updates)
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-organization-subscriptions"] });
      toast.success("Subscription updated");
    },
    onError: (error) => {
      toast.error("Failed to update subscription", { description: error.message });
    },
  });

  const filteredSubscriptions = subscriptions?.filter((sub: any) => {
    const matchesSearch = sub.organization?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || sub.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors = {
    active: "bg-success/10 text-success",
    trialing: "bg-warning/10 text-warning",
    past_due: "bg-destructive/10 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
    suspended: "bg-destructive/10 text-destructive",
  };

  const statusIcons = {
    active: CheckCircle2,
    trialing: Clock,
    past_due: AlertCircle,
    cancelled: XCircle,
    suspended: XCircle,
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="overrides">Overrides</TabsTrigger>
        </TabsList>

        <TabsContent value="subscriptions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Organization Subscriptions
              </CardTitle>
              <CardDescription>
                Manage subscriptions for all organizations
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="mb-6 flex flex-col gap-4 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    placeholder="Search organizations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : !filteredSubscriptions?.length ? (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <CreditCard className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold">No Subscriptions Found</h3>
                  <p className="text-sm text-muted-foreground">
                    {searchQuery || statusFilter !== "all" 
                      ? "Try adjusting your search or filters"
                      : "No organization subscriptions have been created yet"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Organization</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Next Billing</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubscriptions.map((sub: any) => {
                      const StatusIcon = statusIcons[sub.status as keyof typeof statusIcons] || AlertCircle;
                      return (
                        <TableRow key={sub.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">
                                {sub.organization?.name || "Unknown"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span>{sub.plan?.name || "No Plan"}</span>
                              {sub.plan?.price_monthly > 0 && (
                                <span className="text-muted-foreground">
                                  (${sub.plan.price_monthly}/mo)
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="capitalize">{sub.billing_cycle}</TableCell>
                          <TableCell>
                            <Badge className={`gap-1 ${statusColors[sub.status as keyof typeof statusColors] || "bg-muted"}`}>
                              <StatusIcon className="h-3 w-3" />
                              {sub.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {sub.current_period_end
                              ? format(new Date(sub.current_period_end), "MMM d, yyyy")
                              : "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Select
                                value={sub.plan_id}
                                onValueChange={(value) => updateSubscription.mutate({
                                  id: sub.id,
                                  updates: { plan_id: value }
                                })}
                              >
                                <SelectTrigger className="w-[140px]">
                                  <SelectValue placeholder="Change plan" />
                                </SelectTrigger>
                                <SelectContent>
                                  {plans?.map((plan) => (
                                    <SelectItem key={plan.id} value={plan.id}>
                                      {plan.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Select
                                value={sub.status}
                                onValueChange={(value) => updateSubscription.mutate({
                                  id: sub.id,
                                  updates: { status: value }
                                })}
                              >
                                <SelectTrigger className="w-[120px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Active</SelectItem>
                                  <SelectItem value="trialing">Trialing</SelectItem>
                                  <SelectItem value="past_due">Past Due</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                  <SelectItem value="suspended">Suspended</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plans" className="mt-6">
          <PlanEditor />
        </TabsContent>

        <TabsContent value="overrides" className="mt-6">
          <OverridesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
