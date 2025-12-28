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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  Settings2, 
  Plus, 
  Trash2, 
  Building2,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

const overrideTypes = [
  { value: "max_workspaces", label: "Max Workspaces" },
  { value: "max_facilities", label: "Max Facilities" },
  { value: "max_users", label: "Max Users" },
  { value: "max_departments", label: "Max Departments" },
  { value: "max_schedules_per_month", label: "Max Schedules/Month" },
  { value: "max_training_events", label: "Max Training Events" },
  { value: "audit_log_days", label: "Audit Log Days" },
];

export function OverridesManager() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [overrideType, setOverrideType] = useState<string>("");
  const [overrideValue, setOverrideValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");

  const { data: organizations } = useQuery({
    queryKey: ["all-organizations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name")
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  const { data: overrides, isLoading } = useQuery({
    queryKey: ["all-subscription-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_overrides")
        .select(`
          *,
          organization:organizations(id, name)
        `)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const createOverride = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("subscription_overrides")
        .insert({
          organization_id: selectedOrg,
          override_type: overrideType,
          override_value: parseInt(overrideValue),
          reason,
          approved_by: user?.id,
          valid_until: validUntil || null,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subscription-overrides"] });
      setIsDialogOpen(false);
      resetForm();
      toast.success("Override created successfully");
    },
    onError: (error) => {
      toast.error("Failed to create override", {
        description: error.message,
      });
    },
  });

  const toggleOverride = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("subscription_overrides")
        .update({ is_active: !isActive })
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subscription-overrides"] });
      toast.success("Override updated");
    },
  });

  const deleteOverride = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("subscription_overrides")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-subscription-overrides"] });
      toast.success("Override deleted");
    },
  });

  const resetForm = () => {
    setSelectedOrg("");
    setOverrideType("");
    setOverrideValue("");
    setReason("");
    setValidUntil("");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Subscription Overrides
          </CardTitle>
          <CardDescription>
            Grant temporary or permanent limit increases to organizations
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Override
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Limit Override</DialogTitle>
              <DialogDescription>
                Grant additional resources to an organization beyond their plan limits
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Organization</Label>
                <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations?.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Override Type</Label>
                <Select value={overrideType} onValueChange={setOverrideType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select limit type" />
                  </SelectTrigger>
                  <SelectContent>
                    {overrideTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>New Limit Value</Label>
                <Input 
                  type="number" 
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  placeholder="Enter new limit (-1 for unlimited)"
                />
              </div>
              <div className="space-y-2">
                <Label>Valid Until (optional)</Label>
                <Input 
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea 
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this override being granted?"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createOverride.mutate()}
                disabled={!selectedOrg || !overrideType || !overrideValue}
              >
                Create Override
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
        ) : !overrides?.length ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Settings2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No Overrides</h3>
            <p className="text-sm text-muted-foreground">
              No subscription overrides have been created yet.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Override Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {overrides.map((override: any) => (
                <TableRow key={override.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {override.organization?.name || "Unknown"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {overrideTypes.find(t => t.value === override.override_type)?.label || override.override_type}
                  </TableCell>
                  <TableCell className="font-mono">
                    {override.override_value === -1 ? "Unlimited" : override.override_value}
                  </TableCell>
                  <TableCell>
                    {override.valid_until 
                      ? format(new Date(override.valid_until), "MMM d, yyyy")
                      : "Permanent"}
                  </TableCell>
                  <TableCell>
                    <Badge className={override.is_active ? "bg-success/10 text-success" : "bg-muted"}>
                      {override.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => toggleOverride.mutate({ id: override.id, isActive: override.is_active })}
                      >
                        {override.is_active ? (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => deleteOverride.mutate(override.id)}
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
