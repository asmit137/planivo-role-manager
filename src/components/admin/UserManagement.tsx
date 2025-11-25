import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, UserPlus, Mail, Filter, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { z } from 'zod';
import { Switch } from '@/components/ui/switch';

const userSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  full_name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  role: z.enum(['super_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head', 'staff']),
});

const UserManagement = () => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<string>('general_admin');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [filterWorkspace, setFilterWorkspace] = useState<string>('all');
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: facilities } = useQuery({
    queryKey: ['facilities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('facilities')
        .select('*, workspaces(name)')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*, facilities(name, workspace_id)')
        .is('is_template', false)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users', filterWorkspace],
    queryFn: async () => {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch all user roles with related data
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select(`
          *,
          workspaces(name),
          facilities(name),
          departments(name),
          specialty:specialty_id(name)
        `);

      if (rolesError) throw rolesError;

      // Combine profiles with their roles and workspaces
      const usersWithRoles = profiles?.map((profile) => {
        const roles = userRoles?.filter((ur) => ur.user_id === profile.id) || [];
        return {
          ...profile,
          roles,
        };
      });

      // Filter by workspace if selected
      if (filterWorkspace && filterWorkspace !== 'all') {
        return usersWithRoles?.filter((user) =>
          user.roles.some((r: any) => r.workspace_id === filterWorkspace)
        );
      }

      return usersWithRoles;
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
          workspace_id: workspaceId || undefined,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to create user');
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created successfully');
      setEmail('');
      setPassword('');
      setFullName('');
      setRole('general_admin');
      setWorkspaceId('');
      setOpen(false);
    },
    onError: (error: any) => {
      // Handle Zod validation errors
      if (error.name === 'ZodError') {
        const firstError = error.errors?.[0];
        toast.error(firstError?.message || 'Validation failed');
        return;
      }
      
      // Handle all other errors
      toast.error(error.message || 'Failed to create user');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate({
      email,
      password,
      full_name: fullName,
      role,
    });
  };

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, fullName, isActive }: { userId: string; fullName: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          is_active: isActive,
        })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated successfully');
      setEditOpen(false);
      setEditingUser(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update user');
    },
  });

  const addRoleMutation = useMutation({
    mutationFn: async ({ 
      userId, 
      role, 
      workspaceId, 
      facilityId, 
      departmentId,
      specialtyId
    }: { 
      userId: string; 
      role: string; 
      workspaceId?: string; 
      facilityId?: string; 
      departmentId?: string;
      specialtyId?: string;
    }) => {
      const { data, error } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: role as any,
          workspace_id: workspaceId || null,
          facility_id: facilityId || null,
          department_id: departmentId || null,
          specialty_id: specialtyId || null,
        })
        .select();

      if (error) throw error;
      
      return data;
    },
    onSuccess: async () => {
      // Invalidate and refetch
      await queryClient.invalidateQueries({ queryKey: ['users', filterWorkspace] });
      
      // Immediately refetch the updated user data
      if (editingUser) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', editingUser.id)
          .single();

        const { data: userRoles } = await supabase
          .from('user_roles')
          .select(`
            *,
            workspaces(name),
            facilities(name),
            departments(name),
            specialty:specialty_id(name)
          `)
          .eq('user_id', editingUser.id);

        if (profiles && userRoles) {
          setEditingUser({
            ...profiles,
            roles: userRoles,
          });
        }
      }
      
      toast.success('Role added successfully');
      
      // Reset form fields
      setNewRole('general_admin');
      setNewWorkspaceId('');
      setNewFacilityId('');
      setNewDepartmentId('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add role');
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleId);

      if (error) throw error;
    },
    onSuccess: async () => {
      // Invalidate and refetch
      await queryClient.invalidateQueries({ queryKey: ['users', filterWorkspace] });
      
      // Immediately refetch the updated user data
      if (editingUser) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', editingUser.id)
          .single();

        const { data: userRoles } = await supabase
          .from('user_roles')
          .select(`
            *,
            workspaces(name),
            facilities(name),
            departments(name),
            specialty:specialty_id(name)
          `)
          .eq('user_id', editingUser.id);

        if (profiles && userRoles) {
          setEditingUser({
            ...profiles,
            roles: userRoles,
          });
        }
      }
      
      toast.success('Role removed successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove role');
    },
  });

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setEditOpen(true);
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    
    updateUserMutation.mutate({
      userId: editingUser.id,
      fullName: editingUser.full_name,
      isActive: editingUser.is_active,
    });
  };

  const [newRole, setNewRole] = useState('general_admin');
  const [newWorkspaceId, setNewWorkspaceId] = useState<string>('');
  const [newFacilityId, setNewFacilityId] = useState<string>('');
  const [newDepartmentId, setNewDepartmentId] = useState<string>('');
  const [newSubDepartmentId, setNewSubDepartmentId] = useState<string>('');

  // Fetch subdepartments (departments with parent_department_id)
  const { data: subdepartments } = useQuery({
    queryKey: ['subdepartments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*, parent_departments:parent_department_id(name)')
        .not('parent_department_id', 'is', null)
        .is('is_template', false)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const handleAddRole = () => {
    if (!editingUser) return;

    addRoleMutation.mutate({
      userId: editingUser.id,
      role: newRole,
      workspaceId: newWorkspaceId || undefined,
      facilityId: newFacilityId || undefined,
      departmentId: newDepartmentId || undefined,
      specialtyId: newSubDepartmentId || undefined,
    });

    // Reset form
    setNewRole('general_admin');
    setNewWorkspaceId('');
    setNewFacilityId('');
    setNewDepartmentId('');
    setNewSubDepartmentId('');
  };

  const handleDeleteRole = (roleId: string) => {
    if (confirm('Are you sure you want to remove this role?')) {
      deleteRoleMutation.mutate(roleId);
    }
  };

  const getFilteredFacilities = () => {
    if (!newWorkspaceId || !facilities) return [];
    return facilities.filter(f => f.workspace_id === newWorkspaceId);
  };

  const getFilteredDepartments = () => {
    if (!newFacilityId || !departments) return [];
    return departments.filter(d => d.facility_id === newFacilityId && !d.parent_department_id);
  };

  const getFilteredSubDepartments = () => {
    if (!newDepartmentId || !subdepartments) return [];
    return subdepartments.filter(sd => sd.parent_department_id === newDepartmentId);
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>User Management</CardTitle>
            <CardDescription>Create and manage user accounts</CardDescription>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary">
                <UserPlus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Add a new user to the system
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full-name">Full Name</Label>
                  <Input
                    id="full-name"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super_admin">Super Admin</SelectItem>
                      <SelectItem value="general_admin">General Admin</SelectItem>
                      <SelectItem value="workplace_supervisor">Workplace Supervisor</SelectItem>
                      <SelectItem value="facility_supervisor">Facility Supervisor</SelectItem>
                      <SelectItem value="department_head">Department Head</SelectItem>
                      <SelectItem value="staff">Staff</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {role !== 'super_admin' && workspaces && workspaces.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="workspace">Workspace (Optional)</Label>
                    <Select value={workspaceId || undefined} onValueChange={setWorkspaceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select workspace" />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaces.map((workspace) => (
                          <SelectItem key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Edit User Dialog */}
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit User</DialogTitle>
                <DialogDescription>
                  Update user information, status, and roles
                </DialogDescription>
              </DialogHeader>
              {editingUser && (
                <div className="space-y-6">
                  {/* Basic Info Section */}
                  <form onSubmit={handleUpdateSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-full-name">Full Name</Label>
                      <Input
                        id="edit-full-name"
                        value={editingUser.full_name}
                        onChange={(e) => setEditingUser({ ...editingUser, full_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-email">Email</Label>
                      <Input
                        id="edit-email"
                        type="email"
                        value={editingUser.email}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="is-active">Active Status</Label>
                        <p className="text-sm text-muted-foreground">
                          Enable or disable user access
                        </p>
                      </div>
                      <Switch
                        id="is-active"
                        checked={editingUser.is_active}
                        onCheckedChange={(checked) => setEditingUser({ ...editingUser, is_active: checked })}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={updateUserMutation.isPending}>
                      {updateUserMutation.isPending ? 'Updating...' : 'Update User'}
                    </Button>
                  </form>

                  {/* Roles Section */}
                  <div className="space-y-4 border-t pt-4">
                    <div>
                      <h3 className="font-semibold mb-2">Current Roles</h3>
                      {editingUser.roles && editingUser.roles.length > 0 ? (
                        <div className="space-y-2">
                          {editingUser.roles.map((roleData: any) => (
                            <div key={roleData.id} className="flex items-center justify-between p-3 border rounded-lg">
                              <div className="space-y-1">
                                <Badge variant="outline">{roleData.role.replace('_', ' ')}</Badge>
                                <div className="text-sm text-muted-foreground space-y-0.5">
                                  {roleData.workspaces && (
                                    <p>Workspace: {roleData.workspaces.name}</p>
                                  )}
                                  {roleData.facilities && (
                                    <p>Facility: {roleData.facilities.name}</p>
                                  )}
                                  {roleData.departments && (
                                    <p>Department: {roleData.departments.name}</p>
                                  )}
                                  {roleData.specialty && (
                                    <p>Specialty: {roleData.specialty.name}</p>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteRole(roleData.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No roles assigned</p>
                      )}
                    </div>

                    <div className="space-y-3 border-t pt-4">
                      <h3 className="font-semibold">Add New Role</h3>
                      
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={newRole} onValueChange={setNewRole}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background z-50">
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                            <SelectItem value="general_admin">General Admin</SelectItem>
                            <SelectItem value="workplace_supervisor">Workplace Supervisor</SelectItem>
                            <SelectItem value="facility_supervisor">Facility Supervisor</SelectItem>
                            <SelectItem value="department_head">Department Head</SelectItem>
                            <SelectItem value="staff">Staff</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {newRole !== 'super_admin' && (
                        <>
                          <div className="space-y-2">
                            <Label>Workspace</Label>
                            <Select value={newWorkspaceId} onValueChange={(val) => {
                              setNewWorkspaceId(val);
                              setNewFacilityId('');
                              setNewDepartmentId('');
                              setNewSubDepartmentId('');
                            }}>
                              <SelectTrigger className="bg-background">
                                <SelectValue placeholder="Select workspace" />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                {workspaces?.map((workspace) => (
                                  <SelectItem key={workspace.id} value={workspace.id}>
                                    {workspace.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {newWorkspaceId && (
                            <div className="space-y-2">
                              <Label>Facility (Optional)</Label>
                              <Select value={newFacilityId} onValueChange={(val) => {
                                setNewFacilityId(val);
                                setNewDepartmentId('');
                                setNewSubDepartmentId('');
                              }}>
                                <SelectTrigger className="bg-background">
                                  <SelectValue placeholder="Select facility" />
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50">
                                  {getFilteredFacilities().map((facility) => (
                                    <SelectItem key={facility.id} value={facility.id}>
                                      {facility.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {newFacilityId && (
                            <div className="space-y-2">
                              <Label>Department (Optional)</Label>
                              <Select value={newDepartmentId} onValueChange={(val) => {
                                setNewDepartmentId(val);
                                setNewSubDepartmentId('');
                              }}>
                                <SelectTrigger className="bg-background">
                                  <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50">
                                  {getFilteredDepartments().map((dept) => (
                                    <SelectItem key={dept.id} value={dept.id}>
                                      {dept.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          {newDepartmentId && getFilteredSubDepartments().length > 0 && (
                            <div className="space-y-2">
                              <Label>Subdepartment / Specialty (Optional)</Label>
                              <Select value={newSubDepartmentId} onValueChange={setNewSubDepartmentId}>
                                <SelectTrigger className="bg-background">
                                  <SelectValue placeholder="Select subdepartment" />
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50">
                                  {getFilteredSubDepartments().map((subdept) => (
                                    <SelectItem key={subdept.id} value={subdept.id}>
                                      {subdept.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </>
                      )}

                      <Button 
                        onClick={handleAddRole} 
                        className="w-full"
                        disabled={addRoleMutation.isPending}
                      >
                        {addRoleMutation.isPending ? 'Adding...' : 'Add Role'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Workspace Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm">Filter by Workspace:</Label>
            <Select value={filterWorkspace} onValueChange={setFilterWorkspace}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select workspace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Workspaces</SelectItem>
                {workspaces?.map((workspace) => (
                  <SelectItem key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Users Table */}
          {usersLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading users...
            </div>
          ) : users && users.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Workspaces</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user: any) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.is_active ? "default" : "secondary"}>
                          {user.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((roleData: any, idx: number) => (
                            <Badge key={idx} variant="outline">
                              {roleData.role.replace('_', ' ')}
                            </Badge>
                          ))}
                          {user.roles.length === 0 && (
                            <span className="text-xs text-muted-foreground">No roles</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.roles
                            .filter((r: any) => r.workspaces)
                            .map((roleData: any, idx: number) => (
                              <Badge key={idx} className="bg-primary/10">
                                {roleData.workspaces.name}
                              </Badge>
                            ))}
                          {user.roles.every((r: any) => !r.workspaces) && (
                            <span className="text-xs text-muted-foreground">System-wide</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No users found</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default UserManagement;
