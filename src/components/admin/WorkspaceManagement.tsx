import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Building2, Trash2, FolderTree, Settings, Building, Edit, Settings2, MapPin, Clock } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useOrganization } from '@/contexts/OrganizationContext';

const workspaceSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  organization_id: z.string().uuid('Please select an organization'),
});

const workspaceSettingsSchema = z.object({
  max_vacation_splits: z.number().min(1, 'Minimum 1 split').max(20, 'Maximum 20 splits'),
});

interface WorkspaceManagementProps {
  organizationId?: string;
  workspaceId?: string; // New prop for scoped access
  maxWorkspaces?: number | null;
  currentWorkspaceCount?: number;
}

const checkIsAtLimit = (max: number | null | undefined, current: number | undefined): boolean => {
  if (max === null || max === undefined) return false;
  return (current || 0) >= max;
};

const WorkspaceManagement = ({ organizationId, workspaceId, maxWorkspaces, currentWorkspaceCount }: WorkspaceManagementProps = {}) => {
  const { selectedOrganizationId } = useOrganization();

  // Use prop if provided, otherwise use context
  const effectiveOrgId = organizationId || selectedOrganizationId;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  // Initialize with empty string if 'all' is selected (forcing explicit selection for creation)
  const [selectedOrgId, setSelectedOrgId] = useState(effectiveOrgId === 'all' ? '' : (effectiveOrgId || ''));
  const [manageCategoriesOpen, setManageCategoriesOpen] = useState(false);
  const [manageDepartmentsOpen, setManageDepartmentsOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [maxVacationSplits, setMaxVacationSplits] = useState(6);
  const queryClient = useQueryClient();

  // Check if at limit
  const isAtLimit = maxWorkspaces !== undefined && maxWorkspaces !== null &&
    currentWorkspaceCount !== undefined && currentWorkspaceCount >= maxWorkspaces;

  // Real-time subscriptions for live updates
  // ... (keep existing subscriptions)

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      // ... (keep existing query logic)
      let query = supabase
        .from('organizations')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (organizationId) {
        query = supabase.from('organizations').select('*').eq('id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces', effectiveOrgId, workspaceId],
    queryFn: async () => {
      let query = supabase
        .from('workspaces')
        .select('*, organizations(id, name)')
        .order('created_at', { ascending: false });

      // Filter by organization if provided and not 'all'
      if (effectiveOrgId && effectiveOrgId !== 'all') {
        query = query.eq('organization_id', effectiveOrgId);
      }

      // Filter by specific workspace if provided (Scoped View)
      if (workspaceId) {
        query = query.eq('id', workspaceId);
      }

      const { data, error } = await query;
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

      // Check for duplicate name in this organization
      const { data: existing } = await supabase
        .from('workspaces')
        .select('id')
        .eq('organization_id', validated.organization_id)
        .ilike('name', validated.name)
        .maybeSingle();

      if (existing) {
        throw new Error('A workspace with this name already exists in this organization');
      }

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

  const [editNameOpen, setEditNameOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const editMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      // Get current workspace details to check organization scope
      const { data: current } = await supabase
        .from('workspaces')
        .select('organization_id')
        .eq('id', id)
        .single();

      if (!current) throw new Error('Workspace not found');

      // Check for duplicate name in the same organization
      const { data: existing } = await supabase
        .from('workspaces')
        .select('id')
        .eq('organization_id', current.organization_id)
        .ilike('name', name)
        .neq('id', id)
        .maybeSingle();

      if (existing) {
        throw new Error('A workspace with this name already exists in this organization');
      }

      const { error } = await supabase
        .from('workspaces')
        .update({ name })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace updated successfully');
      setEditNameOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update workspace');
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

  const workspaceAtLimit = checkIsAtLimit(maxWorkspaces, currentWorkspaceCount);

  return (
    <Card className="border-none shadow-none sm:border-2 sm:shadow-sm">
      <CardHeader className="px-3 sm:px-6 pt-0 sm:pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">Workspaces</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Manage {workspaceId ? 'this workspace' : 'all system workspaces'}
              {maxWorkspaces !== null && maxWorkspaces !== undefined && (
                <span className="block sm:inline sm:ml-2 text-muted-foreground mt-1 sm:mt-0 font-medium">
                  ({currentWorkspaceCount || 0} / {maxWorkspaces} workspaces)
                </span>
              )}
            </CardDescription>
          </div>

          {/* Only show Create button if NOT in scoped mode */}
          {!workspaceId && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button
                  className="bg-gradient-primary w-full sm:w-auto h-11 sm:h-10 text-xs sm:text-sm"
                  disabled={workspaceAtLimit}
                  title={workspaceAtLimit ? 'Workspace limit reached' : undefined}
                >
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
          )}
        </div>
      </CardHeader>
      <CardContent className="px-3 sm:px-6 py-0 sm:py-6">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : workspaces && workspaces.length > 0 ? (
          <div className="space-y-3 sm:space-y-4">
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border-2 rounded-lg bg-card/50 hover:border-primary/20 transition-all duration-200 gap-3"
              >
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-base sm:text-lg leading-tight truncate">{workspace.name}</h3>
                      {(workspace as any).organizations && (
                        <Badge variant="secondary" className="text-[10px] sm:text-xs h-5 sm:h-auto font-medium">
                          <Building className="h-3 w-3 mr-1.5 shrink-0" />
                          <span className="truncate">{(workspace as any).organizations.name}</span>
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" />
                      Created {new Date(workspace.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Scoped view for actions on mobile and desktop */}
                <div className="flex flex-wrap gap-2 pt-3 sm:pt-0 border-t sm:border-0 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none h-8 sm:h-9 text-[11px] sm:text-xs"
                    onClick={() => {
                      setSelectedWorkspace(workspace);
                      setNewName(workspace.name);
                      setEditNameOpen(true);
                    }}
                  >
                    <Edit className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none h-8 sm:h-9 text-[11px] sm:text-xs"
                    onClick={() => {
                      setSelectedWorkspace(workspace);
                      setManageCategoriesOpen(true);
                    }}
                  >
                    <FolderTree className="h-3.5 w-3.5 mr-1.5" />
                    Categories
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 sm:flex-none h-8 sm:h-9 text-[11px] sm:text-xs"
                    onClick={() => {
                      setSelectedWorkspace(workspace);
                      setManageDepartmentsOpen(true);
                    }}
                  >
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    Depts
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 sm:h-9 sm:w-9 p-0 shrink-0"
                    onClick={() => {
                      setSelectedWorkspace(workspace);
                      setMaxVacationSplits(workspace.max_vacation_splits || 6);
                      setSettingsOpen(true);
                    }}
                  >
                    <Settings className="h-3.5 w-3.5" />
                  </Button>

                  {/* Only show delete if NOT in scoped mode */}
                  {!workspaceId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 sm:h-9 sm:w-9 p-0 ml-auto sm:ml-0"
                      onClick={() => deleteMutation.mutate(workspace.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No workspaces yet.</p>
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

      {/* Edit Workspace Name Dialog */}
      <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Workspace Name</DialogTitle>
            <DialogDescription>
              Rename {selectedWorkspace?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Workspace Name</Label>
              <Input
                id="edit-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter workspace name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditNameOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedWorkspace && newName.trim()) {
                    editMutation.mutate({
                      id: selectedWorkspace.id,
                      name: newName.trim(),
                    });
                  }
                }}
                disabled={editMutation.isPending || !newName.trim()}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card >
  );
};

export default WorkspaceManagement;
