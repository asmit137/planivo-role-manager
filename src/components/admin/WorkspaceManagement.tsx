import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Building2, Trash2, FolderTree, Settings, Building } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const workspaceSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  organization_id: z.string().uuid('Please select an organization'),
});

const workspaceSettingsSchema = z.object({
  max_vacation_splits: z.number().min(1, 'Minimum 1 split').max(20, 'Maximum 20 splits'),
});

const WorkspaceManagement = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [manageDepartmentsOpen, setManageDepartmentsOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maxVacationSplits, setMaxVacationSplits] = useState(6);
  const queryClient = useQueryClient();

  // Real-time subscriptions for live updates
  useRealtimeSubscription({
    table: 'workspaces',
    invalidateQueries: ['workspaces'],
  });

  useRealtimeSubscription({
    table: 'facilities',
    invalidateQueries: ['facilities'],
  });

  useRealtimeSubscription({
    table: 'workspace_categories',
    invalidateQueries: ['workspace-categories'],
  });

  useRealtimeSubscription({
    table: 'workspace_departments',
    invalidateQueries: ['workspace-departments'],
  });

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*, organizations(id, name)')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('is_system_default', { ascending: false })
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const { data: templateDepartments } = useQuery({
    queryKey: ['template-departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('is_template', true)
        .is('parent_department_id', null)
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const { data: workspaceCategories } = useQuery({
    queryKey: ['workspace-categories', selectedWorkspace?.id],
    queryFn: async () => {
      if (!selectedWorkspace) return [];
      
      const { data, error } = await supabase
        .from('workspace_categories')
        .select('*')
        .eq('workspace_id', selectedWorkspace.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedWorkspace,
  });

  const { data: workspaceDepartments } = useQuery({
    queryKey: ['workspace-departments', selectedWorkspace?.id],
    queryFn: async () => {
      if (!selectedWorkspace) return [];
      
      const { data, error } = await supabase
        .from('workspace_departments')
        .select('*')
        .eq('workspace_id', selectedWorkspace.id);
      
      if (error) throw error;
      return data;
    },
    enabled: !!selectedWorkspace,
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, organizationId }: { name: string; organizationId: string }) => {
      const validated = workspaceSchema.parse({ name, organization_id: organizationId });
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('workspaces')
        .insert([{ 
          name: validated.name, 
          organization_id: validated.organization_id,
          created_by: user.id 
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces-by-org'] });
      toast.success('Workspace created successfully');
      setName('');
      setSelectedOrgId('');
      setOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create workspace');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('workspaces')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete workspace');
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async ({ workspaceId, maxSplits }: { workspaceId: string; maxSplits: number }) => {
      const validated = workspaceSettingsSchema.parse({ max_vacation_splits: maxSplits });
      
      const { error } = await supabase
        .from('workspaces')
        .update({ max_vacation_splits: validated.max_vacation_splits })
        .eq('id', workspaceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace settings updated');
      setSettingsOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update settings');
    },
  });

  const toggleCategoryMutation = useMutation({
    mutationFn: async ({ workspaceId, categoryId, isAssigned }: { workspaceId: string; categoryId: string; isAssigned: boolean }) => {
      if (isAssigned) {
        // Remove assignment
        const { error } = await supabase
          .from('workspace_categories')
          .delete()
          .eq('workspace_id', workspaceId)
          .eq('category_id', categoryId);
        
        if (error) throw error;
      } else {
        // Add assignment - use upsert to prevent duplicate key errors
        const { error } = await supabase
          .from('workspace_categories')
          .upsert({
            workspace_id: workspaceId,
            category_id: categoryId,
          }, {
            onConflict: 'workspace_id,category_id',
            ignoreDuplicates: true,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-categories'] });
      toast.success('Category assignment updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update category');
    },
  });

  const toggleDepartmentMutation = useMutation({
    mutationFn: async ({ workspaceId, departmentId, isAssigned }: { workspaceId: string; departmentId: string; isAssigned: boolean }) => {
      if (isAssigned) {
        // Remove assignment
        const { error } = await supabase
          .from('workspace_departments')
          .delete()
          .eq('workspace_id', workspaceId)
          .eq('department_template_id', departmentId);
        
        if (error) throw error;
      } else {
        // Add assignment - use upsert to prevent duplicate key errors
        const { error } = await supabase
          .from('workspace_departments')
          .upsert({
            workspace_id: workspaceId,
            department_template_id: departmentId,
          }, {
            onConflict: 'workspace_id,department_template_id',
            ignoreDuplicates: true,
          });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-departments'] });
      toast.success('Department assignment updated');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update department');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Trim the workspace name
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      toast.error('Workspace name cannot be empty');
      return;
    }
    
    if (trimmedName.length < 2) {
      toast.error('Name must be at least 2 characters');
      return;
    }

    if (!selectedOrgId) {
      toast.error('Please select an organization');
      return;
    }
    
    createMutation.mutate({ name: trimmedName, organizationId: selectedOrgId });
  };

  const isCategoryAssigned = (categoryId: string) => {
    return workspaceCategories?.some(wc => wc.category_id === categoryId) || false;
  };

  const handleToggleCategory = (categoryId: string) => {
    if (!selectedWorkspace || toggleCategoryMutation.isPending) return;
    
    const isAssigned = isCategoryAssigned(categoryId);
    toggleCategoryMutation.mutate({
      workspaceId: selectedWorkspace.id,
      categoryId,
      isAssigned,
    });
  };

  const isDepartmentAssigned = (departmentId: string) => {
    return workspaceDepartments?.some(wd => wd.department_template_id === departmentId) || false;
  };

  const handleToggleDepartment = (departmentId: string) => {
    if (!selectedWorkspace || toggleDepartmentMutation.isPending) return;
    
    const isAssigned = isDepartmentAssigned(departmentId);
    toggleDepartmentMutation.mutate({
      workspaceId: selectedWorkspace.id,
      departmentId,
      isAssigned,
    });
  };

  const getDepartmentsByCategory = (categoryName: string) => {
    return templateDepartments?.filter(d => d.category === categoryName) || [];
  };

  const getAssignedCategories = () => {
    if (!workspaceCategories || !categories) return [];
    const assignedCategoryIds = workspaceCategories.map(wc => wc.category_id);
    return categories.filter(c => assignedCategoryIds.includes(c.id));
  };

  const getAssignedDepartmentsCount = (workspaceId: string) => {
    // This would need a separate query in a real implementation
    return 0;
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Workspaces</CardTitle>
            <CardDescription>Manage all system workspaces</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary">
                <Plus className="mr-2 h-4 w-4" />
                Create Workspace
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Workspace</DialogTitle>
                <DialogDescription>
                  Create a new workspace for an organization or facility network
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="workspace-org">Organization</Label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select organization..." />
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
                  <Label htmlFor="workspace-name">Workspace Name</Label>
                  <Input
                    id="workspace-name"
                    placeholder="e.g., Hospital Network West"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending || !selectedOrgId}>
                  {createMutation.isPending ? 'Creating...' : 'Create Workspace'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : workspaces && workspaces.length > 0 ? (
          <div className="space-y-3">
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="flex items-center justify-between p-4 border-2 rounded-lg hover:border-primary/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{workspace.name}</h3>
                      {(workspace as any).organizations && (
                        <Badge variant="outline" className="text-xs">
                          <Building className="h-3 w-3 mr-1" />
                          {(workspace as any).organizations.name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(workspace.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedWorkspace(workspace);
                      setManageCategoriesOpen(true);
                    }}
                  >
                    <FolderTree className="h-4 w-4 mr-2" />
                    Categories
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedWorkspace(workspace);
                      setManageDepartmentsOpen(true);
                    }}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Departments
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedWorkspace(workspace);
                      setMaxVacationSplits(workspace.max_vacation_splits || 6);
                      setSettingsOpen(true);
                    }}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(workspace.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No workspaces yet. Create your first one!</p>
          </div>
        )}
      </CardContent>

      {/* Manage Categories Dialog */}
      <Dialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Categories</DialogTitle>
            <DialogDescription>
              Select categories for {selectedWorkspace?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {categories && categories.length > 0 ? (
              <div className="grid gap-2">
              {categories.map((category: any) => {
                  const isAssigned = isCategoryAssigned(category.id);
                  const isPending = toggleCategoryMutation.isPending;
                  
                  return (
                    <div
                      key={category.id}
                      className={`flex items-center space-x-2 p-3 rounded-md border hover:bg-accent cursor-pointer transition-colors ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
                      onClick={() => handleToggleCategory(category.id)}
                    >
                      <Checkbox
                        id={category.id}
                        checked={isAssigned}
                        disabled={isPending}
                      />
                      <Label
                        htmlFor={category.id}
                        className="text-sm cursor-pointer flex-1"
                      >
                        <div className="font-medium">{category.name}</div>
                        {category.description && (
                          <div className="text-xs text-muted-foreground">{category.description}</div>
                        )}
                      </Label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No categories available</p>
                <p className="text-sm">Create categories first</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Manage Departments Dialog */}
      <Dialog open={manageDepartmentsOpen} onOpenChange={setManageDepartmentsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manage Departments</DialogTitle>
            <DialogDescription>
              Assign department templates to {selectedWorkspace?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {getAssignedCategories().length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No categories assigned to this workspace</p>
                <p className="text-sm">Please assign categories first</p>
              </div>
            ) : (
              getAssignedCategories().map((category: any) => {
                const categoryDepts = getDepartmentsByCategory(category.name);
                
                if (categoryDepts.length === 0) return null;
                
                return (
                  <div key={category.id} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold">{category.name}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {categoryDepts.filter(d => isDepartmentAssigned(d.id)).length} / {categoryDepts.length}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 ml-6">
                    {categoryDepts.map((dept: any) => {
                        const isAssigned = isDepartmentAssigned(dept.id);
                        const isPending = toggleDepartmentMutation.isPending;
                        
                        return (
                          <div
                            key={dept.id}
                            className={`flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
                            onClick={() => handleToggleDepartment(dept.id)}
                          >
                            <Checkbox
                              id={dept.id}
                              checked={isAssigned}
                              disabled={isPending}
                            />
                            <Label
                              htmlFor={dept.id}
                              className="text-sm cursor-pointer flex-1"
                            >
                              {dept.name}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                    
                    <Separator />
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Workspace Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workspace Settings</DialogTitle>
            <DialogDescription>
              Configure settings for {selectedWorkspace?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="max-splits">Maximum Vacation Splits</Label>
              <Input
                id="max-splits"
                type="number"
                min="1"
                max="20"
                value={maxVacationSplits}
                onChange={(e) => setMaxVacationSplits(parseInt(e.target.value) || 6)}
              />
              <p className="text-xs text-muted-foreground">
                How many vacation periods staff can split their vacation into (1-20)
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedWorkspace) {
                  updateSettingsMutation.mutate({
                    workspaceId: selectedWorkspace.id,
                    maxSplits: maxVacationSplits,
                  });
                }
              }}
              disabled={updateSettingsMutation.isPending}
            >
              Save Settings
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default WorkspaceManagement;
