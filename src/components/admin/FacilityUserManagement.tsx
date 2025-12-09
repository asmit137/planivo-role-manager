import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, Users, Plus, UserPlus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const facilitySchema = z.object({
  name: z.string().min(2, 'Facility name must be at least 2 characters'),
  workspace_id: z.string().uuid('Invalid workspace'),
});

const userSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['general_admin', 'facility_supervisor', 'department_head', 'staff']),
});

interface FacilityUserManagementProps {
  maxFacilities?: number | null;
  currentFacilityCount?: number;
}

const FacilityUserManagement = ({ maxFacilities, currentFacilityCount }: FacilityUserManagementProps) => {
  const facilityAtLimit = maxFacilities !== null && maxFacilities !== undefined && (currentFacilityCount || 0) >= maxFacilities;
  const [facilityDialogOpen, setFacilityDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedFacility, setSelectedFacility] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<string>('staff');
  const queryClient = useQueryClient();

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

  const { data: workspaces, isLoading, isError, error } = useQuery({
    queryKey: ['workspaces-with-facilities'],
    queryFn: async () => {
      const { data: workspacesData, error: workspacesError } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      
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

          // Fetch users for each facility
          const facilitiesWithUsers = await Promise.all(
            facilities.map(async (facility) => {
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
                users: userRoles.map((ur: any) => {
                  const profile = userProfiles?.find(p => p.id === ur.user_id);
                  return {
                    id: profile?.id,
                    full_name: profile?.full_name,
                    email: profile?.email,
                    role: ur.role,
                  };
                }),
              };
            })
          );

          return {
            ...workspace,
            facilities: facilitiesWithUsers,
          };
        })
      );

      return workspacesWithFacilities;
    },
  });

  const createFacilityMutation = useMutation({
    mutationFn: async (data: { name: string; workspace_id: string }) => {
      const validated = facilitySchema.parse(data);
      
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

  const createUserMutation = useMutation({
    mutationFn: async (userData: any) => {
      const validated = userSchema.parse(userData);
      
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: validated.email,
          password: validated.password,
          full_name: validated.full_name,
          role: validated.role,
          facility_id: selectedFacility,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces-with-facilities'] });
      toast.success('User created successfully');
      setEmail('');
      setPassword('');
      setFullName('');
      setRole('staff');
      setSelectedFacility('');
      setUserDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to create user');
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

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFacility) {
      toast.error('Please select a facility');
      return;
    }
    createUserMutation.mutate({
      email,
      password,
      full_name: fullName,
      role,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Workspace & Facility Management</CardTitle>
              <CardDescription>Manage facilities and users within workspaces</CardDescription>
            </div>
            <div className="flex gap-2">
              <Dialog open={facilityDialogOpen} onOpenChange={setFacilityDialogOpen}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    disabled={facilityAtLimit}
                    title={facilityAtLimit ? 'Facility limit reached' : undefined}
                  >
                    <Building2 className="mr-2 h-4 w-4" />
                    Add Facility
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
                          {workspaces?.map((workspace) => (
                            <SelectItem key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </SelectItem>
                          ))}
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
                      {createFacilityMutation.isPending ? 'Creating...' : 'Create Facility'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-primary">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add User to Facility
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add User to Facility</DialogTitle>
                    <DialogDescription>Create a new user and assign to a facility</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Select Facility</Label>
                      <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select facility" />
                        </SelectTrigger>
                        <SelectContent>
                          {workspaces?.flatMap((workspace) =>
                            workspace.facilities.map((facility: any) => (
                              <SelectItem key={facility.id} value={facility.id}>
                                {workspace.name} - {facility.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="user-name">Full Name</Label>
                      <Input
                        id="user-name"
                        placeholder="John Doe"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="user-email">Email</Label>
                      <Input
                        id="user-email"
                        type="email"
                        placeholder="user@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="user-password">Password</Label>
                      <Input
                        id="user-password"
                        type="password"
                        placeholder="Minimum 6 characters"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="user-role">Role</Label>
                      <Select value={role} onValueChange={setRole}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="general_admin">General Admin</SelectItem>
                          <SelectItem value="facility_supervisor">Facility Supervisor</SelectItem>
                          <SelectItem value="department_head">Department Head</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full" disabled={createUserMutation.isPending}>
                      {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Hierarchical View */}
      <Card className="border-2">
        <CardHeader>
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
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                <span className="font-medium">{facility.name}</span>
                              </div>
                              <Badge variant="outline">
                                <Users className="h-3 w-3 mr-1" />
                                {facility.users?.length || 0} users
                              </Badge>
                            </div>
                            {facility.users && facility.users.length > 0 && (
                              <div className="space-y-2">
                                {facility.users.map((user: any) => (
                                  <div key={user.id} className="flex items-center justify-between text-sm p-2 rounded bg-background">
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
