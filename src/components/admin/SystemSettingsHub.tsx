import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Settings, Video, Globe, Shield, Database, Save, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";

export function SystemSettingsHub() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("jitsi");

  // Jitsi configuration
  const { data: jitsiConfig, isLoading: loadingJitsi } = useQuery({
    queryKey: ['jitsi-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jitsi_server_config')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [jitsiForm, setJitsiForm] = useState({
    server_url: '',
    app_id: '',
    app_secret: '',
    is_active: true,
  });

  // Initialize form when data loads
  useState(() => {
    if (jitsiConfig) {
      setJitsiForm({
        server_url: jitsiConfig.server_url || '',
        app_id: jitsiConfig.app_id || '',
        app_secret: jitsiConfig.app_secret || '',
        is_active: jitsiConfig.is_active ?? true,
      });
    }
  });

  const updateJitsiMutation = useMutation({
    mutationFn: async (values: typeof jitsiForm) => {
      if (jitsiConfig?.id) {
        const { error } = await supabase
          .from('jitsi_server_config')
          .update(values)
          .eq('id', jitsiConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('jitsi_server_config')
          .insert(values);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jitsi-config'] });
      toast.success('Jitsi configuration saved');
    },
    onError: (error) => {
      toast.error('Failed to save configuration: ' + error.message);
    },
  });

  // Vacation types
  const { data: vacationTypes } = useQuery({
    queryKey: ['vacation-types-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vacation_types')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Module definitions
  const { data: modules } = useQuery({
    queryKey: ['modules-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_definitions')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const toggleModuleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('module_definitions')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules-settings'] });
      toast.success('Module status updated');
    },
  });

  // Database statistics
  const { data: dbStats } = useQuery({
    queryKey: ['db-stats'],
    queryFn: async () => {
      const [profiles, organizations, workspaces, facilities, departments, tasks, schedules, vacationPlans, trainingEvents, messages, notifications, auditLogs] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('organizations').select('*', { count: 'exact', head: true }),
        supabase.from('workspaces').select('*', { count: 'exact', head: true }),
        supabase.from('facilities').select('*', { count: 'exact', head: true }),
        supabase.from('departments').select('*', { count: 'exact', head: true }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }),
        supabase.from('schedules').select('*', { count: 'exact', head: true }),
        supabase.from('vacation_plans').select('*', { count: 'exact', head: true }),
        supabase.from('training_events').select('*', { count: 'exact', head: true }),
        supabase.from('messages').select('*', { count: 'exact', head: true }),
        supabase.from('notifications').select('*', { count: 'exact', head: true }),
        supabase.from('audit_logs').select('*', { count: 'exact', head: true }),
      ]);

      return {
        profiles: profiles.count || 0,
        organizations: organizations.count || 0,
        workspaces: workspaces.count || 0,
        facilities: facilities.count || 0,
        departments: departments.count || 0,
        tasks: tasks.count || 0,
        schedules: schedules.count || 0,
        vacation_plans: vacationPlans.count || 0,
        training_events: trainingEvents.count || 0,
        messages: messages.count || 0,
        notifications: notifications.count || 0,
        audit_logs: auditLogs.count || 0,
      };
    },
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide mb-6">
          <TabsList className="inline-flex h-auto min-w-max gap-1 p-1">
            <TabsTrigger value="jitsi" className="min-h-[44px] px-3 text-sm">
              <Video className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
              <span className="hidden sm:inline">Video Conferencing</span>
              <span className="sm:hidden">Video</span>
            </TabsTrigger>
            <TabsTrigger value="modules" className="min-h-[44px] px-3 text-sm">
              <Settings className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
              <span className="hidden sm:inline">Modules</span>
              <span className="sm:hidden">Mod</span>
            </TabsTrigger>
            <TabsTrigger value="database" className="min-h-[44px] px-3 text-sm">
              <Database className="h-4 w-4 mr-1.5 sm:mr-2 shrink-0" />
              <span className="hidden sm:inline">Database Stats</span>
              <span className="sm:hidden">DB</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Jitsi Configuration */}
        <TabsContent value="jitsi">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="h-5 w-5" />
                Jitsi Server Configuration
              </CardTitle>
              <CardDescription>
                Configure your Jitsi Meet server for video conferencing in training events
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  {jitsiConfig?.is_active ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                  )}
                  <div>
                    <p className="font-medium">Server Status</p>
                    <p className="text-sm text-muted-foreground">
                      {jitsiConfig?.server_url || 'Not configured'}
                    </p>
                  </div>
                </div>
                <Badge className={jitsiConfig?.is_active ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                  {jitsiConfig?.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="server_url">Server URL</Label>
                  <Input
                    id="server_url"
                    placeholder="https://meet.jit.si"
                    value={jitsiForm.server_url || jitsiConfig?.server_url || ''}
                    onChange={(e) => setJitsiForm(f => ({ ...f, server_url: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="app_id">App ID (Optional)</Label>
                    <Input
                      id="app_id"
                      placeholder="your-app-id"
                      value={jitsiForm.app_id || jitsiConfig?.app_id || ''}
                      onChange={(e) => setJitsiForm(f => ({ ...f, app_id: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="app_secret">App Secret (Optional)</Label>
                    <Input
                      id="app_secret"
                      type="password"
                      placeholder="••••••••"
                      value={jitsiForm.app_secret || ''}
                      onChange={(e) => setJitsiForm(f => ({ ...f, app_secret: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={jitsiForm.is_active ?? jitsiConfig?.is_active ?? true}
                    onCheckedChange={(checked) => setJitsiForm(f => ({ ...f, is_active: checked }))}
                  />
                  <Label htmlFor="is_active">Enable Video Conferencing</Label>
                </div>
              </div>

              <Button
                onClick={() => updateJitsiMutation.mutate(jitsiForm)}
                disabled={updateJitsiMutation.isPending}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Configuration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Modules Configuration */}
        <TabsContent value="modules">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                System Modules
              </CardTitle>
              <CardDescription>
                Enable or disable system modules globally
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {modules?.map(module => (
                  <div
                    key={module.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-muted/50 rounded-lg gap-4 transition-all hover:bg-muted"
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 rounded-lg shrink-0 ${module.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                        <Settings className={`h-4 w-4 ${module.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium leading-none">{module.name}</p>
                        <p className="text-sm text-muted-foreground line-clamp-2">{module.description || module.key}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pl-11 sm:pl-0">
                      <Badge variant="outline" className="font-mono text-xs text-muted-foreground shrink-0">{module.key}</Badge>
                      <Switch
                        checked={module.is_active ?? true}
                        onCheckedChange={(checked) => toggleModuleMutation.mutate({ id: module.id, is_active: checked })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Database Statistics */}
        <TabsContent value="database">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Database Statistics
              </CardTitle>
              <CardDescription>
                Record counts across all system tables
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {dbStats && Object.entries(dbStats).map(([table, count]) => (
                  <div key={table} className="p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground capitalize">{table.replace('_', ' ')}</p>
                    <p className="text-2xl font-bold">{count.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
