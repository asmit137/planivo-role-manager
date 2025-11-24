import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Building2, Trash2, FolderTree, Settings } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { z } from 'zod';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const workspaceSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
});

const WorkspaceManagement = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [manageDepartmentsOpen, setManageDepartmentsOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
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
    mutationFn: async (name: string) => {
      const validated = workspaceSchema.parse({ name });
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('workspaces')
        .insert([{ name: validated.name, created_by: user.id }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace created successfully');
      setName('');
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
        // Add assignment
        const { error } = await supabase
          .from('workspace_departments')
          .insert({
            workspace_id: workspaceId,
            department_template_id: departmentId,
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
    createMutation.mutate(name);
  };

  const isDepartmentAssigned = (departmentId: string) => {
    return workspaceDepartments?.some(wd => wd.department_template_id === departmentId) || false;
  };

  const handleToggleDepartment = (departmentId: string) => {
    if (!selectedWorkspace) return;
    
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
                  <Label htmlFor="workspace-name">Workspace Name</Label>
                  <Input
                    id="workspace-name"
                    placeholder="e.g., Hospital Network West"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
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
                    <h3 className="font-semibold">{workspace.name}</h3>
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
                      setManageDepartmentsOpen(true);
                    }}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Departments
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
            {categories?.map((category: any) => {
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
                      
                      return (
                        <div
                          key={dept.id}
                          className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                          onClick={() => handleToggleDepartment(dept.id)}
                        >
                          <Checkbox
                            id={dept.id}
                            checked={isAssigned}
                            onCheckedChange={() => handleToggleDepartment(dept.id)}
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
            })}

            {(!categories || categories.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No department templates available</p>
                <p className="text-sm">Create categories and departments first</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default WorkspaceManagement;
