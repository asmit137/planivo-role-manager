import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, Users, Plus, UserPlus, FolderTree, Trash2, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useOrganization } from '@/contexts/OrganizationContext';
import { SearchableSelect } from '@/components/shared/SearchableSelect';

const facilitySchema = z.object({
  name: z.string().min(2, 'Facility name must be at least 2 characters'),
  workspace_id: z.string().uuid('Invalid workspace'),
});

// User schema no longer needed here if we remove the creation dialog

interface FacilityUserManagementProps {
  maxFacilities?: number | null;
  currentFacilityCount?: number;
}

const FacilityUserManagement = ({ maxFacilities, currentFacilityCount }: FacilityUserManagementProps) => {
  const facilityAtLimit = maxFacilities !== null && maxFacilities !== undefined && (currentFacilityCount || 0) >= maxFacilities;
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | undefined>(undefined);
  const [facilityName, setFacilityName] = useState('');
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | undefined>(undefined);
  const [selectedDeptTemplateId, setSelectedDeptTemplateId] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const { selectedOrganizationId } = useOrganization();

  // Real-time subscriptions for live updates
  useRealtimeSubscription({
    table: 'profiles',
    invalidateQueries: ['workspaces-with-facilities'],
  });

  useRealtimeSubscription({
    table: 'user_roles',
    invalidateQueries: ['workspaces-with-facilities'],
  });

  useRealtimeSubscription({
    table: 'facilities',
    invalidateQueries: ['workspaces-with-facilities'],
  });

  useRealtimeSubscription({
    table: 'workspace_departments',
    invalidateQueries: ['workspaces-with-facilities', 'workspace-dept-templates'],
  });

  useRealtimeSubscription({
    table: 'workspace_categories',
    invalidateQueries: ['workspaces-with-facilities', 'workspace-dept-templates'],
  });

  const { data: workspaces, isLoading, isError, error } = useQuery({
    queryKey: ['workspaces-with-facilities', selectedOrganizationId],
    queryFn: async () => {
      let query = supabase
        .from('workspaces')
        .select('*')
        .order('name');

      // Filter by organization if one is selected (not "all")
      if (selectedOrganizationId && selectedOrganizationId !== 'all') {
        query = query.eq('organization_id', selectedOrganizationId);
      }

      const { data: workspacesData, error: workspacesError } = await query;

      if (workspacesError) throw workspacesError;

      // Fetch facilities for each workspace
      const workspacesWithFacilities = await Promise.all(
        workspacesData.map(async (workspace) => {
          const { data: facilities, error: facilitiesError } = await supabase
            .from('facilities')
            .select('*')
            .eq('workspace_id', workspace.id)
            .order('name');

          if (facilitiesError) throw facilitiesError;

          // Fetch facilities for each workspace with their departments
          const facilitiesWithDetails = await Promise.all(
            facilities.map(async (facility) => {
              // Fetch departments for this facility
              const { data: departments, error: deptsError } = await supabase
                .from('departments')
                .select('*')
                .eq('facility_id', facility.id)
                .order('name');

              if (deptsError) throw deptsError;

              const { data: userRoles, error: rolesError } = await supabase
                .from('user_roles')
                .select('*')
                .eq('facility_id', facility.id);

              if (rolesError) throw rolesError;

              // Fetch user profiles separately
              const userIds = userRoles?.map(ur => ur.user_id) || [];
              const { data: userProfiles, error: profilesError } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .in('id', userIds);

              if (profilesError) throw profilesError;

              return {
                ...facility,
                departments: departments || [],
                users: userRoles.map((ur: any) => {
                  const profile = userProfiles?.find(p => p.id === ur.user_id);
                  return {
                    id: profile?.id,
                    role_id: ur.id,
                    full_name: profile?.full_name || 'Unknown User',
                    email: profile?.email || '',
                    role: ur.role,
                  };
                }),
              };
            })
          );

          return {
            ...workspace,
            facilities: facilitiesWithDetails,
          };
        })
      );

      return workspacesWithFacilities;
    },
  });

  const createFacilityMutation = useMutation({
    mutationFn: async (data: { name: string; workspace_id: string }) => {
      const validated = facilitySchema.parse(data);

      // Check for duplicate name in this workspace
      const { data: existing } = await supabase
        .from('facilities')
        .select('id')
        .eq('workspace_id', validated.workspace_id)
        .ilike('name', validated.name)
        .maybeSingle();

      if (existing) {
        throw new Error('A facility with this name already exists in this workspace');
      }

      const { data: facility, error } = await supabase
        .from('facilities')
        .insert({
          name: validated.name,
          workspace_id: validated.workspace_id,
        })
        .select()
        .single();

      if (error) throw error;
      return facility;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces-with-facilities'] });
      toast.success('Facility created successfully');
      setFacilityName('');
      setSelectedWorkspace('');
      setFacilityDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create facility');
    },
  });

  // Fetch available department templates for the selected facility's workspace
  const { data: deptTemplates } = useQuery({
    queryKey: ['workspace-dept-templates', selectedFacilityId],
    enabled: !!selectedFacilityId,
    queryFn: async () => {
      // Find the workspace ID for this facility
      const { data: facility } = await supabase
        .from('facilities')
        .select('workspace_id')
        .eq('id', selectedFacilityId)
        .single();

      if (!facility) return [];

      // 1. Get explicitly assigned departments
      const { data: directDepts, error: directError } = await supabase
        .from('workspace_departments')
        .select(`
          department_template_id,
          departments!workspace_departments_department_template_id_fkey (*)
        `)
        .eq('workspace_id', facility.workspace_id);

      if (directError) throw directError;

      // 2. Get departments from assigned categories
      const { data: assignedCategories, error: catError } = await supabase
        .from('workspace_categories')
        .select(`
          category_id,
          categories (
            name
          )
        `)
        .eq('workspace_id', facility.workspace_id);

      if (catError) throw catError;

      const categoryNames = assignedCategories
        .map((c: any) => c.categories?.name)
        .filter(Boolean);

      let categoryDepts: any[] = [];
      if (categoryNames.length > 0) {
        const { data: catDepts, error: catDeptsError } = await supabase
          .from('departments')
          .select('*')
          .in('category', categoryNames)
          .eq('is_template', true)
          .is('parent_department_id', null);

        if (catDeptsError) throw catDeptsError;
        categoryDepts = catDepts || [];
      }

      // Combine and remove duplicates by ID
      const direct = directDepts?.map(item => item.departments) || [];
      const combined = [...direct, ...categoryDepts];
      const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());

      return unique;
    },
  });

  const addDeptMutation = useMutation({
    mutationFn: async ({ facilityId, templateId }: { facilityId: string; templateId: string }) => {
      // Get template details
      const { data: template, error: templateError } = await supabase
        .from('departments')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError) throw templateError;

      // Check for duplicate in this facility
      const { data: existing } = await supabase
        .from('departments')
        .select('id')
        .eq('facility_id', facilityId)
        .eq('name', template.name)
        .maybeSingle();

      if (existing) {
        throw new Error(`Department "${template.name}" already exists in this facility`);
      }

      // Create new department instance
      const { data, error } = await supabase
        .from('departments')
        .insert({
          name: template.name,
          category: template.category,
          min_staffing: template.min_staffing,
          facility_id: facilityId,
          is_template: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces-with-facilities'] });
      toast.success('Department added to facility');
      setDeptDialogOpen(false);
      setSelectedDeptTemplateId('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add department');
    },
  });

  const deleteDeptMutation = useMutation({
    mutationFn: async (deptId: string) => {
      const { error } = await supabase
        .from('departments')
        .delete()
        .eq('id', deptId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces-with-facilities'] });
      toast.success('Department removed successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove department');
    },
  });


  const handleCreateFacility = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace) {
      toast.error('Please select a workspace');
      return;
    }
    createFacilityMutation.mutate({
      name: facilityName,
      workspace_id: selectedWorkspace,
    });
  };


  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <Card className="border-2 overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg sm:text-xl">Workspace & Facility Management</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Manage facilities and users within workspaces</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Dialog open={facilityDialogOpen} onOpenChange={setFacilityDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={facilityAtLimit}
                    title={facilityAtLimit ? 'Facility limit reached' : undefined}
                    className="flex-1 sm:flex-none"
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    <span className="whitespace-nowrap">Add Facility</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Facility</DialogTitle>
                    <DialogDescription>Create a new facility within a workspace</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateFacility} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="workspace">Workspace</Label>
                      <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select workspace" />
                        </SelectTrigger>
                        <SelectContent>
                          {workspaces && workspaces.length > 0 ? (
                            workspaces.map((workspace) => (
                              <SelectItem key={workspace.id} value={workspace.id}>
                                {workspace.name}
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-2 text-xs text-muted-foreground text-center">
                              No workspaces available
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="facility-name">Facility Name</Label>
                      <Input
                        id="facility-name"
                        placeholder="Enter facility name"
                        value={facilityName}
                        onChange={(e) => setFacilityName(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={createFacilityMutation.isPending}>
                      {createFacilityMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating...
                        </>
                      ) : 'Create Facility'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={deptDialogOpen} onOpenChange={setDeptDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Department Template</DialogTitle>
                    <DialogDescription>Select a department template to add to this facility</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Available Templates</Label>
                      <SearchableSelect
                        options={deptTemplates?.map((template: any) => ({
                          label: template.name,
                          group: template.category || 'No Category',
                          value: template.id
                        })) || []}
                        value={selectedDeptTemplateId}
                        onChange={setSelectedDeptTemplateId}
                        placeholder="Select a template"
                        emptyMessage="No templates found."
                      />
                    </div>
                    <Button
                      className="w-full"
                      disabled={!selectedDeptTemplateId || addDeptMutation.isPending}
                      onClick={() => addDeptMutation.mutate({
                        facilityId: selectedFacilityId,
                        templateId: selectedDeptTemplateId
                      })}
                    >
                      {addDeptMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : 'Add Department'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Hierarchical View */}
      <Card className="border-2 overflow-hidden">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle>Organizational Structure</CardTitle>
          <CardDescription>View workspaces, facilities, and their users</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Loading organizational structure...</p>
            </div>
          ) : isError ? (
            <div className="text-center py-8 text-destructive">
              <p>Error loading data: {error?.message}</p>
            </div>
          ) : !workspaces || workspaces.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No workspaces found</p>
            </div>
          ) : (
            <Accordion type="multiple" className="space-y-4">
              {workspaces.map((workspace: any) => (
                <AccordionItem key={workspace.id} value={workspace.id} className="border rounded-lg">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-primary" />
                      <span className="font-semibold">{workspace.name}</span>
                      <Badge variant="secondary">{workspace.facilities?.length || 0} facilities</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    {!workspace.facilities || workspace.facilities.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">No facilities in this workspace</p>
                    ) : (
                      <div className="space-y-3 mt-2">
                        {workspace.facilities.map((facility: any) => (
                          <div key={facility.id} className="border rounded-lg p-4 bg-muted/30">
                            <div className="flex items-center justify-between mb-4 pb-2 border-b">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-primary" />
                                <span className="font-semibold text-lg">{facility.name}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedFacilityId(facility.id);
                                    setDeptDialogOpen(true);
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add Dept
                                </Button>
                                <Badge variant="outline">
                                  <Users className="h-3 w-3 mr-1" />
                                  {facility.users?.length || 0} users
                                </Badge>
                              </div>
                            </div>

                            {/* Departments Section */}
                            <div className="mb-4">
                              <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                                <FolderTree className="h-4 w-4" />
                                <span>Departments</span>
                              </div>
                              {(!facility.departments || facility.departments.length === 0) ? (
                                <p className="text-xs text-muted-foreground bg-background p-2 rounded border border-dashed text-center">
                                  No departments assigned
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {facility.departments.map((dept: any) => (
                                    <div key={dept.id} className="flex items-center justify-between p-2 rounded bg-background border text-sm group">
                                      <div className="flex flex-col">
                                        <span className="font-medium">{dept.name}</span>
                                        <span className="text-[10px] text-muted-foreground uppercase">{dept.category}</span>
                                      </div>
                                      <Button
                                        variant="destructive-ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to remove ${dept.name}?`)) {
                                            deleteDeptMutation.mutate(dept.id);
                                          }
                                        }}
                                      >
                                        {deleteDeptMutation.isPending && selectedFacilityId === dept.id ? (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3 w-3" />
                                        )}
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                              <Users className="h-4 w-4" />
                              <span>Users</span>
                            </div>
                            {facility.users && facility.users.length > 0 && (
                              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {facility.users.map((user: any) => (
                                  <div key={user.role_id} className="flex items-center justify-between text-sm p-2 rounded bg-background">
                                    <div>
                                      <p className="font-medium">{user.full_name}</p>
                                      <p className="text-xs text-muted-foreground">{user.email}</p>
                                    </div>
                                    <Badge variant="outline" className="text-xs">
                                      {user.role.replace('_', ' ')}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default FacilityUserManagement;
