import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Monitor, Plus, Trash2, QrCode } from "lucide-react";
import { format } from "date-fns";

interface DisplayToken {
  id: string;
  name: string;
  token: string;
  department_id: string | null;
  facility_id: string | null;
  workspace_id: string | null;
  is_active: boolean;
  show_staff_names: boolean;
  refresh_interval_seconds: number;
  created_at: string;
  expires_at: string | null;
  last_accessed_at: string | null;
}

interface ScheduleDisplaySettingsProps {
  workspaceId?: string;
  facilityId?: string;
  departmentId?: string;
}

export function ScheduleDisplaySettings({
  workspaceId,
  facilityId,
  departmentId,
}: ScheduleDisplaySettingsProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [showStaffNames, setShowStaffNames] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState("60");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tokens, isLoading } = useQuery({
    queryKey: ["schedule-display-tokens", workspaceId, facilityId, departmentId],
    queryFn: async () => {
      let query = supabase
        .from("schedule_display_tokens")
        .select("*")
        .order("created_at", { ascending: false });

      if (departmentId) {
        query = query.eq("department_id", departmentId);
      } else if (facilityId) {
        query = query.eq("facility_id", facilityId);
      } else if (workspaceId) {
        query = query.eq("workspace_id", workspaceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DisplayToken[];
    },
  });

  const createTokenMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("schedule_display_tokens")
        .insert({
          name: newTokenName,
          department_id: departmentId || null,
          facility_id: facilityId || null,
          workspace_id: workspaceId || null,
          show_staff_names: showStaffNames,
          refresh_interval_seconds: parseInt(refreshInterval),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-display-tokens"] });
      setIsCreateOpen(false);
      setNewTokenName("");
      toast({
        title: "Display token created",
        description: "You can now use this token to display schedules.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error creating token",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const { error } = await supabase
        .from("schedule_display_tokens")
        .delete()
        .eq("id", tokenId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-display-tokens"] });
      toast({
        title: "Token deleted",
        description: "The display token has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error deleting token",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleTokenMutation = useMutation({
    mutationFn: async ({ tokenId, isActive }: { tokenId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("schedule_display_tokens")
        .update({ is_active: isActive })
        .eq("id", tokenId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-display-tokens"] });
    },
  });

  const getDisplayUrl = (token: string) => {
    return `${window.location.origin}/schedule-display?token=${token}`;
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "The display URL has been copied.",
    });
  };

  const openInNewTab = (token: string) => {
    window.open(getDisplayUrl(token), "_blank");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5" />
              Schedule Display Screens
            </CardTitle>
            <CardDescription>
              Create display tokens for showing schedules on TV screens or monitors
            </CardDescription>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Display
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Display Token</DialogTitle>
                <DialogDescription>
                  Create a new token to display schedules on a screen without authentication
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Lobby TV, Break Room Screen"
                    value={newTokenName}
                    onChange={(e) => setNewTokenName(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="show-names">Show Staff Names</Label>
                  <Switch
                    id="show-names"
                    checked={showStaffNames}
                    onCheckedChange={setShowStaffNames}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="refresh">Refresh Interval</Label>
                  <Select value={refreshInterval} onValueChange={setRefreshInterval}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 seconds</SelectItem>
                      <SelectItem value="60">1 minute</SelectItem>
                      <SelectItem value="120">2 minutes</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createTokenMutation.mutate()}
                  disabled={!newTokenName || createTokenMutation.isPending}
                >
                  Create Token
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : tokens && tokens.length > 0 ? (
          <div className="space-y-4">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{token.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        token.is_active
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {token.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Created {format(new Date(token.created_at), "MMM d, yyyy")}
                    {token.last_accessed_at && (
                      <> • Last viewed {format(new Date(token.last_accessed_at), "MMM d, HH:mm")}</>
                    )}
                  </div>
                  <code className="text-xs bg-muted px-2 py-1 rounded block mt-1 max-w-md truncate">
                    {getDisplayUrl(token.token)}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={token.is_active}
                    onCheckedChange={(checked) =>
                      toggleTokenMutation.mutate({ tokenId: token.id, isActive: checked })
                    }
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(getDisplayUrl(token.token))}
                    title="Copy URL"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openInNewTab(token.token)}
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteTokenMutation.mutate(token.id)}
                    className="text-destructive hover:text-destructive"
                    title="Delete token"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Monitor className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No display tokens created yet</p>
            <p className="text-sm">Create a token to display schedules on screens</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
