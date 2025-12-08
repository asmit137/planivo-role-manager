import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Building, Trash2, Edit, ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { z } from 'zod';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const organizationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  description: z.string().max(500, 'Description too long').optional(),
});

const OrganizationManagement = () => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<any>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Real-time subscriptions
  useRealtimeSubscription({
    table: 'organizations',
    invalidateQueries: ['organizations'],
  });

  useRealtimeSubscription({
    table: 'workspaces',
    invalidateQueries: ['workspaces-by-org'],
  });

  const { data: organizations, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const { data: workspacesByOrg } = useQuery({
    queryKey: ['workspaces-by-org'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const validated = organizationSchema.parse({ name, description });
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('organizations')
        .insert([{ 
          name: validated.name, 
          description: validated.description || null,
          created_by: user.id 
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization created successfully');
      resetForm();
      setCreateOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create organization');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      const validated = organizationSchema.parse({ name, description });
      
      const { error } = await supabase
        .from('organizations')
        .update({ 
          name: validated.name, 
          description: validated.description || null 
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization updated successfully');
      resetForm();
      setEditOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update organization');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete organization');
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setSelectedOrg(null);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ name: name.trim(), description: description.trim() });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    updateMutation.mutate({ 
      id: selectedOrg.id, 
      name: name.trim(), 
      description: description.trim() 
    });
  };

  const openEditDialog = (org: any) => {
    setSelectedOrg(org);
    setName(org.name);
    setDescription(org.description || '');
    setEditOpen(true);
  };

  const toggleExpanded = (orgId: string) => {
    const newExpanded = new Set(expandedOrgs);
    if (newExpanded.has(orgId)) {
      newExpanded.delete(orgId);
    } else {
      newExpanded.add(orgId);
    }
    setExpandedOrgs(newExpanded);
  };

  const getWorkspacesForOrg = (orgId: string) => {
    return workspacesByOrg?.filter(w => w.organization_id === orgId) || [];
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Manage top-level organizations that contain workspaces</CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary">
                <Plus className="mr-2 h-4 w-4" />
                Create Organization
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Organization</DialogTitle>
                <DialogDescription>
                  Organizations are the top-level structure containing multiple workspaces
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="org-name">Organization Name</Label>
                  <Input
                    id="org-name"
                    placeholder="e.g., Healthcare Group International"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="org-description">Description (Optional)</Label>
                  <Textarea
                    id="org-description"
                    placeholder="Brief description of the organization..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Organization'}
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
        ) : organizations && organizations.length > 0 ? (
          <div className="space-y-3">
            {organizations.map((org) => {
              const orgWorkspaces = getWorkspacesForOrg(org.id);
              const isExpanded = expandedOrgs.has(org.id);
              
              return (
                <Collapsible key={org.id} open={isExpanded} onOpenChange={() => toggleExpanded(org.id)}>
                  <div className="border-2 rounded-lg hover:border-primary/20 transition-colors">
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="p-0 h-auto">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-muted-foreground" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Building className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{org.name}</h3>
                            <Badge variant="secondary" className="text-xs">
                              {orgWorkspaces.length} workspace{orgWorkspaces.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          {org.description && (
                            <p className="text-sm text-muted-foreground">{org.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            Created {new Date(org.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(org)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (orgWorkspaces.length > 0) {
                              toast.error('Cannot delete organization with workspaces. Remove workspaces first.');
                              return;
                            }
                            deleteMutation.mutate(org.id);
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    
                    <CollapsibleContent>
                      <div className="px-4 pb-4 pt-0 ml-8 border-t">
                        <h4 className="text-sm font-medium text-muted-foreground mt-3 mb-2">Workspaces</h4>
                        {orgWorkspaces.length > 0 ? (
                          <div className="space-y-2">
                            {orgWorkspaces.map((ws) => (
                              <div key={ws.id} className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                                <Building className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm">{ws.name}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No workspaces in this organization yet.</p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <Building className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No organizations yet. Create your first one!</p>
          </div>
        )}
      </CardContent>

      {/* Edit Organization Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update organization details
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-org-name">Organization Name</Label>
              <Input
                id="edit-org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-org-description">Description (Optional)</Label>
              <Textarea
                id="edit-org-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default OrganizationManagement;
