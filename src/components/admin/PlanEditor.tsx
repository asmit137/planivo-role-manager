import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  CreditCard, 
  Plus, 
  Edit2, 
  Trash2,
  Sparkles,
  Check,
} from "lucide-react";
import { toast } from "sonner";

interface PlanFormData {
  name: string;
  slug: string;
  description: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  limits: Record<string, number>;
  is_active: boolean;
  is_popular: boolean;
  is_enterprise: boolean;
  display_order: number;
}

const defaultLimits = {
  max_workspaces: 1,
  max_facilities: 2,
  max_users: 5,
  max_departments: 5,
  max_schedules_per_month: 10,
  max_training_events: 5,
  audit_log_days: 7,
  api_access: 0,
  priority_support: 0,
};

export function PlanEditor() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [formData, setFormData] = useState<PlanFormData>({
    name: "",
    slug: "",
    description: "",
    price_monthly: 0,
    price_yearly: 0,
    features: [],
    limits: defaultLimits,
    is_active: true,
    is_popular: false,
    is_enterprise: false,
    display_order: 0,
  });
  const [featuresText, setFeaturesText] = useState("");

  const { data: plans, isLoading } = useQuery({
    queryKey: ["all-subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("display_order");
      
      if (error) throw error;
      return data;
    },
  });

  const savePlan = useMutation({
    mutationFn: async () => {
      const features = featuresText.split("\n").filter(f => f.trim());
      const planData = {
        ...formData,
        features,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from("subscription_plans")
          .update(planData)
          .eq("id", editingPlan.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("subscription_plans")
          .insert(planData);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subscription-plans"] });
      setIsDialogOpen(false);
      resetForm();
      toast.success(editingPlan ? "Plan updated" : "Plan created");
    },
    onError: (error) => {
      toast.error("Failed to save plan", { description: error.message });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subscription_plans")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subscription-plans"] });
      toast.success("Plan deleted");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      slug: "",
      description: "",
      price_monthly: 0,
      price_yearly: 0,
      features: [],
      limits: defaultLimits,
      is_active: true,
      is_popular: false,
      is_enterprise: false,
      display_order: 0,
    });
    setFeaturesText("");
    setEditingPlan(null);
  };

  const openEditDialog = (plan: any) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      slug: plan.slug,
      description: plan.description || "",
      price_monthly: Number(plan.price_monthly),
      price_yearly: Number(plan.price_yearly),
      features: plan.features || [],
      limits: plan.limits || defaultLimits,
      is_active: plan.is_active,
      is_popular: plan.is_popular,
      is_enterprise: plan.is_enterprise,
      display_order: plan.display_order,
    });
    setFeaturesText((plan.features || []).join("\n"));
    setIsDialogOpen(true);
  };

  const updateLimit = (key: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      limits: { ...prev.limits, [key]: value },
    }));
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Plans
          </CardTitle>
          <CardDescription>
            Manage pricing plans and their features
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPlan ? "Edit Plan" : "Create Plan"}</DialogTitle>
              <DialogDescription>
                Configure the plan details, pricing, and limits
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="details" className="py-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="pricing">Pricing</TabsTrigger>
                <TabsTrigger value="limits">Limits</TabsTrigger>
              </TabsList>
              
              <TabsContent value="details" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Plan Name</Label>
                    <Input 
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Professional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug</Label>
                    <Input 
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                      placeholder="professional"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea 
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="For established organizations"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Features (one per line)</Label>
                  <Textarea 
                    value={featuresText}
                    onChange={(e) => setFeaturesText(e.target.value)}
                    placeholder="10 Workspaces&#10;50 Facilities&#10;100 Users"
                    rows={6}
                  />
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={formData.is_active}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                    />
                    <Label>Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={formData.is_popular}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_popular: checked }))}
                    />
                    <Label>Most Popular</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={formData.is_enterprise}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_enterprise: checked }))}
                    />
                    <Label>Enterprise</Label>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="pricing" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Monthly Price ($)</Label>
                    <Input 
                      type="number"
                      value={formData.price_monthly}
                      onChange={(e) => setFormData(prev => ({ ...prev, price_monthly: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Yearly Price ($)</Label>
                    <Input 
                      type="number"
                      value={formData.price_yearly}
                      onChange={(e) => setFormData(prev => ({ ...prev, price_yearly: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Display Order</Label>
                  <Input 
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_order: Number(e.target.value) }))}
                  />
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">
                  Set -1 for unlimited. Set 0 to disable a feature.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(formData.limits).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <Label className="capitalize">
                        {key.replace(/_/g, " ").replace("max ", "")}
                      </Label>
                      <Input 
                        type="number"
                        value={value}
                        onChange={(e) => updateLimit(key, Number(e.target.value))}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => savePlan.mutate()}>
                {editingPlan ? "Update Plan" : "Create Plan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Monthly</TableHead>
                <TableHead>Yearly</TableHead>
                <TableHead>Features</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans?.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{plan.name}</span>
                      {plan.is_popular && (
                        <Badge className="gap-1 bg-primary/10 text-primary">
                          <Sparkles className="h-3 w-3" />
                          Popular
                        </Badge>
                      )}
                      {plan.is_enterprise && (
                        <Badge variant="secondary">Enterprise</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {Number(plan.price_monthly) === 0 ? "Free" : `$${plan.price_monthly}`}
                  </TableCell>
                  <TableCell>
                    {Number(plan.price_yearly) === 0 ? "Free" : `$${plan.price_yearly}`}
                  </TableCell>
                  <TableCell>
                    <span className="text-muted-foreground">
                      {(plan.features as string[])?.length || 0} features
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={plan.is_active ? "bg-success/10 text-success" : "bg-muted"}>
                      {plan.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => openEditDialog(plan)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => deletePlan.mutate(plan.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
