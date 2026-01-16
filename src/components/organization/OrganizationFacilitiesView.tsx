import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, Users, MapPin, Edit, Trash2 } from 'lucide-react';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface OrganizationFacilitiesViewProps {
  organizationId: string;
  facilityId?: string; // New prop for scoped access
}

const OrganizationFacilitiesView = ({ organizationId, facilityId }: OrganizationFacilitiesViewProps) => {
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedFacility, setSelectedFacility] = useState<any>(null);
  const queryClient = useQueryClient();

  const editMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase
        .from('facilities')
        .update({ name })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-facilities-view'] });
      toast.success('Facility updated successfully');
      setEditNameOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update facility');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('facilities')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-facilities-view'] });
      toast.success('Facility deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to delete facility');
    },
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [newFacilityName, setNewFacilityName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');

  const createMutation = useMutation({
    mutationFn: async ({ name, workspaceId }: { name: string; workspaceId: string }) => {
      const { data, error } = await supabase
        .from('facilities')
        .insert([{ name, workspace_id: workspaceId }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-facilities-view'] });
      toast.success('Facility created successfully');
      setCreateOpen(false);
      setNewFacilityName('');
      setSelectedWorkspaceId('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create facility');
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFacilityName.trim()) {
      toast.error('Facility name is required');
      return;
    }
    if (!selectedWorkspaceId) {
      toast.error('Please select a workspace');
      return;
    }
    createMutation.mutate({ name: newFacilityName, workspaceId: selectedWorkspaceId });
  };

  const { data: workspacesWithFacilities, isLoading } = useQuery({
    queryKey: ['org-facilities-view', organizationId, facilityId],
    queryFn: async () => {
      // STRATEGY 1: If facilityId is provided, fetch specifically that facility and its workspace
      // This works even if organizationId is missing/undefined/incorrect
      if (facilityId) {
        const { data: facility, error: facError } = await supabase
          .from('facilities')
          .select(`
            *,
            workspaces (
              id,
              name
            )
          `)
          .eq('id', facilityId)
          .single();

        if (facError) throw facError;
        if (!facility) return [];

        const workspace = facility.workspaces;
        if (!workspace) return [];

        // Fetch stats
        const { count: deptCount } = await supabase
          .from('departments')
          .select('*', { count: 'exact', head: true })
          .eq('facility_id', facility.id);

        const { count: userCount } = await supabase
          .from('user_roles')
          .select('*', { count: 'exact', head: true })
          .eq('facility_id', facility.id);

        const facilityWithStats = {
          ...facility,
          departmentCount: deptCount || 0,
          userCount: userCount || 0,
        };

        return [{
          id: (workspace as any).id,
          name: (workspace as any).name,
          facilities: [facilityWithStats],
          facilityCount: 1,
        }];
      }

      // STRATEGY 2: Fallback to organization-based fetch (for Admins/Org Supervisors)
      if (!organizationId) return [];

      let workspacesQuery = supabase
        .from('workspaces')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      const { data: workspaces, error: wsError } = await workspacesQuery;

      if (wsError) throw wsError;
      if (!workspaces || workspaces.length === 0) return [];

      const workspacesWithData = await Promise.all(
        workspaces.map(async (ws) => {
          let facilitiesQuery = supabase
            .from('facilities')
            .select('id, name')
            .eq('workspace_id', ws.id)
            .order('name');

          const { data: facilities, error: facError } = await facilitiesQuery;

          if (facError) throw facError;

          const facilitiesWithStats = await Promise.all(
            (facilities || []).map(async (fac) => {
              const { count: deptCount } = await supabase
                .from('departments')
                .select('*', { count: 'exact', head: true })
                .eq('facility_id', fac.id);

              const { count: userCount } = await supabase
                .from('user_roles')
                .select('*', { count: 'exact', head: true })
                .eq('facility_id', fac.id);

              return {
                ...fac,
                departmentCount: deptCount || 0,
                userCount: userCount || 0,
              };
            })
          );

          return {
            ...ws,
            facilities: facilitiesWithStats,
            facilityCount: facilitiesWithStats.length,
          };
        })
      );

      return workspacesWithData.filter(ws => ws.facilities.length > 0);
    },
    enabled: !!organizationId || !!facilityId, // Enable if EITHER is present
  });

  if (isLoading) {
    return <LoadingState message="Loading facilities..." />;
  }

  if (!workspacesWithFacilities || workspacesWithFacilities.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No Facilities"
        description="No facilities have been created in your organization yet."
      />
    );
  }

  const totalFacilities = workspacesWithFacilities.reduce((acc, ws) => acc + ws.facilityCount, 0);

  return (
    <div className="space-y-6">
      <Card className="border-2 shadow-sm">
        <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4 border-b bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 shrink-0">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg sm:text-xl font-bold tracking-tight">Organization Facilities</CardTitle>
              <CardDescription className="text-xs sm:text-sm mt-0.5">
                {totalFacilities} facilities across {workspacesWithFacilities.length} workspaces
              </CardDescription>
            </div>
          </div>

          {!facilityId && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="ml-auto bg-gradient-primary text-xs sm:text-sm h-9 sm:h-10">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Facility
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Facility</DialogTitle>
                  <DialogDescription>
                    Create a new facility in one of your workspaces.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="workspace">Workspace</Label>
                    <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select workspace..." />
                      </SelectTrigger>
                      <SelectContent>
                        {workspacesWithFacilities?.map((ws) => (
                          <SelectItem key={ws.id} value={ws.id}>
                            {ws.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="facility-name">Facility Name</Label>
                    <Input
                      id="facility-name"
                      placeholder="e.g., Main Campus"
                      value={newFacilityName}
                      onChange={(e) => setNewFacilityName(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Facility'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          <Accordion type="multiple" className="space-y-2">
            {workspacesWithFacilities.map((workspace) => (
              <AccordionItem key={workspace.id} value={workspace.id} className="border rounded-lg">
                <AccordionTrigger className="px-3 sm:px-5 py-3.5 sm:py-4 hover:no-underline hover:bg-muted/50 transition-all rounded-t-lg">
                  <div className="flex items-center gap-2.5 text-left min-w-0 flex-1">
                    <Building2 className="h-4 w-4 sm:h-5 w-5 text-primary shrink-0 opacity-80" />
                    <span className="font-semibold text-sm sm:text-base line-clamp-1 flex-1">{workspace.name}</span>
                    <Badge variant="secondary" className="shrink-0 text-[10px] sm:text-xs font-medium px-2">
                      {workspace.facilityCount} {workspace.facilityCount === 1 ? 'fac' : 'facs'}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-3 sm:px-4 pb-4">
                  {workspace.facilities.length === 0 ? (
                    <div className="py-6 text-center border-2 border-dashed rounded-lg bg-muted/5 mt-2">
                      <p className="text-xs sm:text-sm text-muted-foreground">No facilities in this workspace</p>
                    </div>
                  ) : (
                    <div className="grid gap-2.5 sm:gap-4 grid-cols-1 xs:grid-cols-2 md:grid-cols-3 pt-3">
                      {workspace.facilities.map((facility: any) => (
                        <Card key={facility.id} className="bg-background border-2 hover:border-primary/20 transition-all shadow-sm">
                          <CardContent className="p-3 sm:p-4">
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <span className="font-semibold text-sm sm:text-[15px] leading-tight line-clamp-2">{facility.name}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 hover:bg-primary/5 hover:text-primary transition-colors"
                                onClick={() => {
                                  setSelectedFacility(facility);
                                  setNewName(facility.name);
                                  setEditNameOpen(true);
                                }}
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>

                              {!facilityId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 hover:bg-destructive/10 hover:text-destructive transition-colors ml-1"
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this facility? This action cannot be undone.')) {
                                      deleteMutation.mutate(facility.id);
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="outline" className="text-[10px] px-1.5 h-5 flex items-center gap-1 bg-muted/30">
                                {facility.departmentCount} Depts
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 h-5 flex items-center gap-1 bg-muted/30">
                                <Users className="h-3 w-3 opacity-70" />
                                {facility.userCount} Users
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Edit Facility Name Dialog */}
      <Dialog open={editNameOpen} onOpenChange={setEditNameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Facility Name</DialogTitle>
            <DialogDescription>
              Rename {selectedFacility?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Facility Name</Label>
              <Input
                id="edit-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Enter facility name"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditNameOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedFacility && newName.trim()) {
                    editMutation.mutate({
                      id: selectedFacility.id,
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
    </div>
  );
};

export default OrganizationFacilitiesView;
