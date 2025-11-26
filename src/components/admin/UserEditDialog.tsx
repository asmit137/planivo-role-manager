import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Plus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';

interface UserEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  onUserUpdate: (updatedUser: any) => void;
  mode?: 'full' | 'scoped'; // 'full' = Super Admin view, 'scoped' = Department Head view
}

const UserEditDialog = ({ open, onOpenChange, user, onUserUpdate, mode = 'full' }: UserEditDialogProps) => {
  const [fullName, setFullName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [newRole, setNewRole] = useState('general_admin');
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const [newFacilityId, setNewFacilityId] = useState('');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newSpecialtyId, setNewSpecialtyId] = useState('');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleDepartmentId, setEditRoleDepartmentId] = useState('');
  const [editRoleSpecialtyId, setEditRoleSpecialtyId] = useState('');
  
  // For scoped mode (Department Head editing staff)
  const [scopedDepartmentId, setScopedDepartmentId] = useState('');
  const [scopedSpecialtyId, setScopedSpecialtyId] = useState('');
  
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setIsActive(user.is_active ?? true);
      
      // Initialize scoped mode fields
      if (mode === 'scoped' && user.roles?.length > 0) {
        const staffRole = user.roles.find((r: any) => r.role === 'staff' || r.role === 'department_head');
        if (staffRole) {
          setScopedDepartmentId(staffRole.department_id || '');
          setScopedSpecialtyId(staffRole.specialty_id || '');
        }
      }
    }
  }, [user, mode]);

  // Fetch modules
  const { data: modules } = useQuery({
    queryKey: ['modules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_definitions')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  // Fetch role module access for user's roles
  const { data: userModuleAccess } = useQuery({
    queryKey: ['user-module-access', user?.id],
    queryFn: async () => {
      if (!user?.roles || user.roles.length === 0) return [];
      
      const roles = user.roles.map((r: any) => r.role);
      const { data, error } = await supabase
        .from('role_module_access')
        .select('*, module_definitions(*)')
        .in('role', roles);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user && user.roles?.length > 0,
  });

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
        .select('*')
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
        .select('*')
        .is('is_template', false)
        .is('parent_department_id', null)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: specialties } = useQuery({
    queryKey: ['specialties', newDepartmentId],
    queryFn: async () => {
      if (!newDepartmentId) return [];
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('parent_department_id', newDepartmentId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!newDepartmentId,
  });

  const { data: editSpecialties } = useQuery({
    queryKey: ['edit-specialties', editRoleDepartmentId],
    queryFn: async () => {
      if (!editRoleDepartmentId) return [];
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('parent_department_id', editRoleDepartmentId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!editRoleDepartmentId,
  });

  const { data: scopedSpecialties } = useQuery({
    queryKey: ['scoped-specialties', scopedDepartmentId],
    queryFn: async () => {
      if (!scopedDepartmentId) return [];
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('parent_department_id', scopedDepartmentId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!scopedDepartmentId && mode === 'scoped',
  });

  const updateUserMutation = useMutation({
    mutationFn: async () => {
      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          is_active: isActive,
        })
        .eq('id', user.id);

      if (profileError) throw profileError;

      // Update specialty if in scoped mode
      if (mode === 'scoped' && user.roles?.length > 0) {
        const staffRole = user.roles.find((r: any) => r.role === 'staff' || r.role === 'department_head');
        if (staffRole) {
          const { error: roleError } = await supabase
            .from('user_roles')
            .update({
              department_id: scopedDepartmentId || null,
              specialty_id: scopedSpecialtyId || null,
            })
            .eq('id', staffRole.id);

          if (roleError) throw roleError;
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['unified-users'] });
      const { data: updatedProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (updatedProfile && userRoles) {
        onUserUpdate({ ...updatedProfile, roles: userRoles });
      }
      
      toast.success('User updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update user');
    },
  });

  const addRoleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: newRole as any,
          workspace_id: newWorkspaceId || null,
          facility_id: newFacilityId || null,
          department_id: newDepartmentId || null,
          specialty_id: newSpecialtyId || null,
        });

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['user-module-access', user.id] });
      
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (userRoles) {
        onUserUpdate({ ...user, roles: userRoles });
      }
      
      toast.success('Role added successfully');
      setNewRole('general_admin');
      setNewWorkspaceId('');
      setNewFacilityId('');
      setNewDepartmentId('');
      setNewSpecialtyId('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add role');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ roleId, departmentId, specialtyId }: { roleId: string; departmentId: string; specialtyId: string }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({
          department_id: departmentId || null,
          specialty_id: specialtyId || null,
        })
        .eq('id', roleId);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['user-module-access', user.id] });
      
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (userRoles) {
        onUserUpdate({ ...user, roles: userRoles });
      }
      
      setEditingRoleId(null);
      setEditRoleDepartmentId('');
      setEditRoleSpecialtyId('');
      toast.success('Role updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to update role');
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
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['user-module-access', user.id] });
      
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (userRoles) {
        onUserUpdate({ ...user, roles: userRoles });
      }
      
      toast.success('Role removed successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to remove role');
    },
  });

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserMutation.mutate();
  };

  const handleAddRole = () => {
    addRoleMutation.mutate();
  };

  const handleDeleteRole = (roleId: string) => {
    if (confirm('Are you sure you want to remove this role?')) {
      deleteRoleMutation.mutate(roleId);
    }
  };

  const handleEditRole = (roleData: any) => {
    setEditingRoleId(roleData.id);
    setEditRoleDepartmentId(roleData.department_id || '');
    setEditRoleSpecialtyId(roleData.specialty_id || '');
  };

  const handleSaveRoleEdit = () => {
    if (editingRoleId) {
      updateRoleMutation.mutate({
        roleId: editingRoleId,
        departmentId: editRoleDepartmentId,
        specialtyId: editRoleSpecialtyId,
      });
    }
  };

  const handleCancelRoleEdit = () => {
    setEditingRoleId(null);
    setEditRoleDepartmentId('');
    setEditRoleSpecialtyId('');
  };

  const getFilteredFacilities = () => {
    if (!newWorkspaceId || !facilities) return [];
    return facilities.filter(f => f.workspace_id === newWorkspaceId);
  };

  const getFilteredDepartments = () => {
    if (!newFacilityId || !departments) return [];
    return departments.filter(d => d.facility_id === newFacilityId);
  };

  const getEditFilteredDepartments = (facilityId: string) => {
    if (!facilityId || !departments) return [];
    return departments.filter(d => d.facility_id === facilityId);
  };

  // Group module access by module
  const moduleAccessByModule = userModuleAccess?.reduce((acc: any, access: any) => {
    const moduleId = access.module_id;
    if (!acc[moduleId]) {
      acc[moduleId] = {
        module: access.module_definitions,
        can_view: false,
        can_edit: false,
        can_delete: false,
        can_admin: false,
      };
    }
    // Combine permissions (OR logic - if any role has permission, user has it)
    acc[moduleId].can_view = acc[moduleId].can_view || access.can_view;
    acc[moduleId].can_edit = acc[moduleId].can_edit || access.can_edit;
    acc[moduleId].can_delete = acc[moduleId].can_delete || access.can_delete;
    acc[moduleId].can_admin = acc[moduleId].can_admin || access.can_admin;
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update user information, roles, and view module permissions
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-6">
            {/* Basic Info Section */}
            <form onSubmit={handleUpdateSubmit} className="space-y-4" autoComplete="off" data-form-type="other">
              <div className="space-y-2">
                <Label htmlFor="full-name">Full Name</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={user.email}
                  disabled
                  className="bg-muted"
                  autoComplete="off"
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
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>

              {/* Department and Specialty fields for scoped mode (Department Head editing staff) */}
              {mode === 'scoped' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="department">Department</Label>
                    <Select value={scopedDepartmentId} onValueChange={(val) => {
                      setScopedDepartmentId(val);
                      setScopedSpecialtyId('');
                    }}>
                      <SelectTrigger id="department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        {departments?.map((dept) => (
                          <SelectItem key={dept.id} value={dept.id}>
                            {dept.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {scopedDepartmentId && scopedSpecialties && scopedSpecialties.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="specialty">Specialty</Label>
                      <Select value={scopedSpecialtyId} onValueChange={setScopedSpecialtyId}>
                        <SelectTrigger id="specialty">
                          <SelectValue placeholder="Select specialty" />
                        </SelectTrigger>
                        <SelectContent>
                          {scopedSpecialties.map((specialty) => (
                            <SelectItem key={specialty.id} value={specialty.id}>
                              {specialty.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              <Button type="submit" className="w-full" disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? 'Updating...' : 'Update User'}
              </Button>
            </form>

            <Separator />

            {/* Roles Section - Only show in full mode */}
            {mode === 'full' && (
              <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-3">Current Roles</h3>
                {user.roles && user.roles.length > 0 ? (
                  <div className="space-y-2">
                    {user.roles.map((roleData: any) => {
                      const workspace = workspaces?.find(w => w.id === roleData.workspace_id);
                      const facility = facilities?.find(f => f.id === roleData.facility_id);
                      const department = departments?.find(d => d.id === roleData.department_id);
                      const specialty = editSpecialties?.find(s => s.id === roleData.specialty_id);
                      const isEditing = editingRoleId === roleData.id;
                      
                      return (
                        <div key={roleData.id} className="p-3 border rounded-lg space-y-3">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{roleData.role.replace(/_/g, ' ')}</Badge>
                            <div className="flex gap-2">
                              {!isEditing ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditRole(roleData)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteRole(roleData.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="default"
                                    size="sm"
                                    onClick={handleSaveRoleEdit}
                                    disabled={updateRoleMutation.isPending}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancelRoleEdit}
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                          
                          {!isEditing ? (
                            <div className="text-sm text-muted-foreground space-y-0.5">
                              {workspace && <p>Workspace: {workspace.name}</p>}
                              {facility && <p>Facility: {facility.name}</p>}
                              {department && <p>Department: {department.name}</p>}
                              {specialty && <p>Specialty: {specialty.name}</p>}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="text-sm text-muted-foreground space-y-0.5">
                                {workspace && <p>Workspace: {workspace.name}</p>}
                                {facility && <p>Facility: {facility.name}</p>}
                              </div>
                              
                              {roleData.facility_id && (
                                <div className="space-y-2">
                                  <Label>Department</Label>
                                  <Select 
                                    value={editRoleDepartmentId} 
                                    onValueChange={(val) => {
                                      setEditRoleDepartmentId(val);
                                      setEditRoleSpecialtyId('');
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select department" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getEditFilteredDepartments(roleData.facility_id).map((dept) => (
                                        <SelectItem key={dept.id} value={dept.id}>
                                          {dept.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              {editRoleDepartmentId && editSpecialties && editSpecialties.length > 0 && (
                                <div className="space-y-2">
                                  <Label>Specialty</Label>
                                  <Select value={editRoleSpecialtyId} onValueChange={setEditRoleSpecialtyId}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select specialty" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {editSpecialties.map((spec) => (
                                        <SelectItem key={spec.id} value={spec.id}>
                                          {spec.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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

                {newRole !== 'super_admin' && (
                  <>
                    <div className="space-y-2">
                      <Label>Workspace</Label>
                      <Select value={newWorkspaceId} onValueChange={(val) => {
                        setNewWorkspaceId(val);
                        setNewFacilityId('');
                        setNewDepartmentId('');
                        setNewSpecialtyId('');
                      }}>
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

                    {newWorkspaceId && (
                      <div className="space-y-2">
                        <Label>Facility (Optional)</Label>
                        <Select value={newFacilityId} onValueChange={(val) => {
                          setNewFacilityId(val);
                          setNewDepartmentId('');
                          setNewSpecialtyId('');
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select facility" />
                          </SelectTrigger>
                          <SelectContent>
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
                          setNewSpecialtyId('');
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {getFilteredDepartments().map((dept) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {newDepartmentId && specialties && specialties.length > 0 && (
                      <div className="space-y-2">
                        <Label>Specialty (Optional)</Label>
                        <Select value={newSpecialtyId} onValueChange={setNewSpecialtyId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select specialty" />
                          </SelectTrigger>
                          <SelectContent>
                            {specialties.map((specialty) => (
                              <SelectItem key={specialty.id} value={specialty.id}>
                                {specialty.name}
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
                  <Plus className="h-4 w-4 mr-2" />
                  {addRoleMutation.isPending ? 'Adding...' : 'Add Role'}
                </Button>
              </div>
            </div>
            )}

            <Separator />

            {/* Module Permissions Section (Read-only) - Only show in full mode */}
            {mode === 'full' && (
              <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">Module Access Permissions</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  These permissions are derived from the user's assigned roles
                </p>
              </div>

              {moduleAccessByModule && Object.keys(moduleAccessByModule).length > 0 ? (
                <div className="space-y-3">
                  {Object.values(moduleAccessByModule).map((access: any) => (
                    <div key={access.module.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{access.module.name}</h4>
                          {access.module.description && (
                            <p className="text-sm text-muted-foreground">{access.module.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="flex items-center space-x-2">
                          <Checkbox checked={access.can_view} disabled />
                          <Label className="text-sm font-normal">View</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox checked={access.can_edit} disabled />
                          <Label className="text-sm font-normal">Edit</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox checked={access.can_delete} disabled />
                          <Label className="text-sm font-normal">Delete</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox checked={access.can_admin} disabled />
                          <Label className="text-sm font-normal">Admin</Label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No module permissions assigned (no roles assigned)</p>
              )}
            </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default UserEditDialog;
