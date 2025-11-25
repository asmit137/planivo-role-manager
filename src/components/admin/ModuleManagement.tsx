import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  Lock, 
  Unlock, 
  Settings, 
  Eye, 
  Edit, 
  Trash2, 
  Shield,
  Loader2,
  AlertCircle,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Module {
  id: string;
  name: string;
  key: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  depends_on: string[] | null;
}

interface RoleModuleAccess {
  id: string;
  role: 'super_admin' | 'general_admin' | 'workplace_supervisor' | 'facility_supervisor' | 'department_head' | 'staff';
  module_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_admin: boolean;
}

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  general_admin: 'General Admin',
  workplace_supervisor: 'Workplace Supervisor',
  facility_supervisor: 'Facility Supervisor',
  department_head: 'Department Head',
  staff: 'Staff',
};

const roleColors: Record<string, string> = {
  super_admin: 'bg-primary text-primary-foreground',
  general_admin: 'bg-accent text-accent-foreground',
  workplace_supervisor: 'bg-success text-success-foreground',
  facility_supervisor: 'bg-warning text-warning-foreground',
  department_head: 'bg-blue-500 text-white',
  staff: 'bg-secondary text-secondary-foreground',
};

const ModuleManagement = () => {
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [dependencyWarning, setDependencyWarning] = useState<{ module: Module; dependentModules: string[] } | null>(null);
  const queryClient = useQueryClient();

  const { data: modules, isLoading: modulesLoading } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_definitions')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Module[];
    },
  });

  const { data: roleAccess, isLoading: accessLoading } = useQuery({
    queryKey: ['role-module-access', selectedModule?.id],
    queryFn: async () => {
      if (!selectedModule) return [];
      
      const { data, error } = await supabase
        .from('role_module_access')
        .select('*')
        .eq('module_id', selectedModule.id);
      
      if (error) throw error;
      return data as RoleModuleAccess[];
    },
    enabled: !!selectedModule,
  });

  const toggleModuleMutation = useMutation({
    mutationFn: async ({ moduleId, isActive }: { moduleId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('module_definitions')
        .update({ is_active: isActive })
        .eq('id', moduleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['modules'] });
      toast.success('Module status updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update module: ${error.message}`);
    },
  });

  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ 
      accessId, 
      permissions 
    }: { 
      accessId: string; 
      permissions: Partial<RoleModuleAccess> 
    }) => {
      const { error } = await supabase
        .from('role_module_access')
        .update(permissions)
        .eq('id', accessId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-module-access'] });
      toast.success('Permissions updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update permissions: ${error.message}`);
    },
  });

  const checkDependencies = (module: Module): string[] => {
    if (!modules) return [];
    
    return modules
      .filter((m) => 
        m.is_active && 
        m.depends_on && 
        m.depends_on.includes(module.key)
      )
      .map((m) => m.name);
  };

  const handleModuleToggle = (module: Module, checked: boolean) => {
    if (!checked) {
      const dependentModules = checkDependencies(module);
      if (dependentModules.length > 0) {
        setDependencyWarning({ module, dependentModules });
        return;
      }
    }
    
    toggleModuleMutation.mutate({ moduleId: module.id, isActive: checked });
  };

  const handleOpenPermissions = (module: Module) => {
    setSelectedModule(module);
    setPermissionsDialogOpen(true);
  };

  const handlePermissionChange = (
    accessId: string,
    field: 'can_view' | 'can_edit' | 'can_delete' | 'can_admin',
    value: boolean
  ) => {
    updatePermissionsMutation.mutate({
      accessId,
      permissions: { [field]: value },
    });
  };

  if (modulesLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            System Modules
          </CardTitle>
          <CardDescription>
            Manage system modules and their availability across roles
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Disabling a module will prevent all users from accessing that feature, regardless of their role. 
              The Core module cannot be disabled as it contains essential authentication features.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            {modules?.map((module) => (
              <Card key={module.id} className="border-2">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">{module.name}</h3>
                        <Badge variant={module.is_active ? 'default' : 'secondary'}>
                          {module.is_active ? (
                            <>
                              <Unlock className="h-3 w-3 mr-1" />
                              Active
                            </>
                          ) : (
                            <>
                              <Lock className="h-3 w-3 mr-1" />
                              Disabled
                            </>
                          )}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {module.description || 'No description available'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <code className="px-2 py-1 bg-muted rounded">{module.key}</code>
                        {module.depends_on && module.depends_on.length > 0 && (
                          <span>
                            Depends on: {module.depends_on.join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenPermissions(module)}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Configure Roles
                      </Button>
                      <div className="flex items-center gap-2">
                        <Label htmlFor={`module-${module.id}`} className="cursor-pointer">
                          {module.is_active ? 'Enabled' : 'Disabled'}
                        </Label>
                        <Switch
                          id={`module-${module.id}`}
                          checked={module.is_active}
                          onCheckedChange={(checked) => handleModuleToggle(module, checked)}
                          disabled={module.key === 'core'}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Permissions Dialog */}
      <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Role Permissions: {selectedModule?.name}</DialogTitle>
            <DialogDescription>
              Configure which roles can view, edit, delete, and administrate this module
            </DialogDescription>
          </DialogHeader>

          {accessLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-center">
                      <Eye className="h-4 w-4 mx-auto" />
                      <span className="text-xs">View</span>
                    </TableHead>
                    <TableHead className="text-center">
                      <Edit className="h-4 w-4 mx-auto" />
                      <span className="text-xs">Edit</span>
                    </TableHead>
                    <TableHead className="text-center">
                      <Trash2 className="h-4 w-4 mx-auto" />
                      <span className="text-xs">Delete</span>
                    </TableHead>
                    <TableHead className="text-center">
                      <Shield className="h-4 w-4 mx-auto" />
                      <span className="text-xs">Admin</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleAccess?.map((access) => (
                    <TableRow key={access.id}>
                      <TableCell>
                        <Badge className={roleColors[access.role]}>
                          {roleLabels[access.role] || access.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={access.can_view}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(access.id, 'can_view', checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={access.can_edit}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(access.id, 'can_edit', checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={access.can_delete}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(access.id, 'can_delete', checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={access.can_admin}
                          onCheckedChange={(checked) =>
                            handlePermissionChange(access.id, 'can_admin', checked as boolean)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Permission Levels:</strong>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li><strong>View:</strong> Can see and access the module</li>
                    <li><strong>Edit:</strong> Can create and modify items within the module</li>
                    <li><strong>Delete:</strong> Can remove items from the module</li>
                    <li><strong>Admin:</strong> Can configure module settings and permissions</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                The <strong>{dependencyWarning?.module.name}</strong> module cannot be disabled because the following modules depend on it:
              </p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {dependencyWarning?.dependentModules.map((name) => (
                  <li key={name} className="font-medium">{name}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Please disable or reconfigure the dependent modules first before disabling this module.
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

export default ModuleManagement;
