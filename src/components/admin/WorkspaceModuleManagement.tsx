import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Module {
  id: string;
  name: string;
  key: string;
  description: string | null;
  is_active: boolean | null;
  depends_on: string[] | null;
}

const WorkspaceModuleManagement = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dependencyWarning, setDependencyWarning] = useState<{ module: Module; dependentModules: string[] } | null>(null);

  const { data: userRole } = useQuery({
    queryKey: ['general-admin-role', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('workspace_id')
        .eq('user_id', user?.id)
        .eq('role', 'general_admin')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: modules, isLoading } = useQuery({
    queryKey: ['system-modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_definitions')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Module[];
    },
  });

  const { data: workspaceModules } = useQuery({
    queryKey: ['workspace-modules', userRole?.workspace_id],
    queryFn: async () => {
      if (!userRole?.workspace_id) return [];
      const { data, error } = await supabase
        .from('workspace_module_access')
        .select('*')
        .eq('workspace_id', userRole.workspace_id);
      if (error) throw error;
      return data;
    },
    enabled: !!userRole?.workspace_id,
  });

  const toggleModuleMutation = useMutation({
    mutationFn: async ({ moduleId, enabled }: { moduleId: string; enabled: boolean }) => {
      if (!userRole?.workspace_id) throw new Error('No workspace found');

      const existing = workspaceModules?.find((wm) => wm.module_id === moduleId);

      if (existing) {
        const { error } = await supabase
          .from('workspace_module_access')
          .update({ is_enabled: enabled })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('workspace_module_access')
          .insert({
            workspace_id: userRole.workspace_id,
            module_id: moduleId,
            is_enabled: enabled,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-modules'] });
      queryClient.invalidateQueries({ queryKey: ['user-modules'] });
      toast.success('Module access updated');
    },
    onError: (error) => {
      toast.error('Failed to update module access');
      console.error(error);
    },
  });

  const checkDependencies = (module: Module): string[] => {
    if (!modules) return [];
    
    return modules
      .filter((m) => {
        const mStatus = getModuleStatusRaw(m.id, m.is_active || false);
        return mStatus.enabled && m.depends_on && m.depends_on.includes(module.key);
      })
      .map((m) => m.name);
  };

  const getModuleStatusRaw = (moduleId: string, isActive: boolean) => {
    if (!isActive) {
      return { label: 'System Disabled', color: 'destructive', enabled: false, canToggle: false };
    }

    const workspaceOverride = workspaceModules?.find((wm) => wm.module_id === moduleId);
    if (!workspaceOverride) {
      return { label: 'Active', color: 'success', enabled: true, canToggle: true };
    }

    if (workspaceOverride.is_enabled) {
      return { label: 'Active', color: 'success', enabled: true, canToggle: true };
    }

    return { label: 'Workspace Disabled', color: 'secondary', enabled: false, canToggle: true };
  };

  const getModuleStatus = (moduleId: string, isActive: boolean) => {
    return getModuleStatusRaw(moduleId, isActive);
  };

  const handleModuleToggle = (module: Module, enabled: boolean) => {
    if (!enabled) {
      const dependentModules = checkDependencies(module);
      if (dependentModules.length > 0) {
        setDependencyWarning({ module, dependentModules });
        return;
      }
    }

    toggleModuleMutation.mutate({ moduleId: module.id, enabled });
  };

  if (isLoading) {
    return <div className="text-center p-12">Loading modules...</div>;
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Control which modules are available in your workspace. You can only restrict modules that are enabled
          system-wide. System-disabled modules cannot be enabled here.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4">
        {modules?.map((module) => {
          const status = getModuleStatus(module.id, module.is_active || false);
          return (
            <Card key={module.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{module.name}</CardTitle>
                    <CardDescription>{module.description}</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={status.color as any}>{status.label}</Badge>
                    <Switch
                      checked={status.enabled}
                      disabled={!status.canToggle}
                      onCheckedChange={(checked) => handleModuleToggle(module, checked)}
                    />
                  </div>
                </div>
              </CardHeader>
              {!module.is_active && (
                <CardContent>
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      This module is disabled system-wide by the Super Admin and cannot be enabled.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Dependency Warning Dialog */}
      <AlertDialog open={!!dependencyWarning} onOpenChange={() => setDependencyWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Cannot Disable Module
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                The <strong>{dependencyWarning?.module.name}</strong> module cannot be disabled because the following modules in your workspace depend on it:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {dependencyWarning?.dependentModules.map((name) => (
                  <li key={name} className="font-medium">{name}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Please disable the dependent modules first before disabling this module.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDependencyWarning(null)}>
              Understood
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkspaceModuleManagement;
