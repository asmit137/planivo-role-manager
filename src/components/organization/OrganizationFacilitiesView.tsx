import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, Users, MapPin, Edit } from 'lucide-react';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Organization Facilities
          </CardTitle>
          <CardDescription>
            {totalFacilities} facilities across {workspacesWithFacilities.length} workspaces
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="space-y-2">
            {workspacesWithFacilities.map((workspace) => (
              <AccordionItem key={workspace.id} value={workspace.id} className="border rounded-lg">
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <span className="font-semibold">{workspace.name}</span>
                    <Badge variant="secondary">{workspace.facilityCount} facilities</Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4">
                  {workspace.facilities.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">No facilities in this workspace</p>
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                      {workspace.facilities.map((facility: any) => (
                        <Card key={facility.id} className="bg-muted/30">
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">{facility.name}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedFacility(facility);
                                  setNewName(facility.name);
                                  setEditNameOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex gap-2 text-xs">
                              <Badge variant="outline">
                                {facility.departmentCount} depts
                              </Badge>
                              <Badge variant="outline">
                                <Users className="h-3 w-3 mr-1" />
                                {facility.userCount} users
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
