import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Plus, Building2 } from 'lucide-react';
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
  const [newRole, setNewRole] = useState('staff');
  const [newWorkspaceId, setNewWorkspaceId] = useState('');
  const [newFacilityId, setNewFacilityId] = useState('');
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [newSpecialtyId, setNewSpecialtyId] = useState('');
  const [newOrganizationId, setNewOrganizationId] = useState('');
  const [newCustomRoleId, setNewCustomRoleId] = useState('');

  const handleNewRoleChange = (value: string) => {
    const isCustom = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    if (isCustom) {
      setNewRole('custom');
      setNewCustomRoleId(value);
    } else {
      setNewRole(value);
      setNewCustomRoleId('');
    }
  };
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editRoleDepartmentId, setEditRoleDepartmentId] = useState('');
  const [editRoleSpecialtyId, setEditRoleSpecialtyId] = useState('');
  const [editRoleFacilityId, setEditRoleFacilityId] = useState('');

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

  // Fetch custom roles
  const { data: customRoles } = useQuery({
    queryKey: ['custom-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_roles')
        .select('id, name')
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

      const enumRoles = user.roles.filter((r: any) => r.role !== 'custom').map((r: any) => r.role);
      const customRoleIds = user.roles.filter((r: any) => r.role === 'custom').map((r: any) => r.custom_role_id);

      let combinedData: any[] = [];

      if (enumRoles.length > 0) {
        const { data: enumData, error: enumError } = await supabase
          .from('role_module_access')
          .select('*, module_definitions(*)')
          .in('role', enumRoles);
        if (enumError) throw enumError;
        combinedData = [...combinedData, ...enumData];
      }

      if (customRoleIds.length > 0) {
        const { data: customData, error: customError } = await supabase
          .from('custom_role_module_access')
          .select('*, module_definitions(*)')
          .in('role_id', customRoleIds);
        if (customError) throw customError;
        combinedData = [...combinedData, ...customData];
      }

      return combinedData;
    },
    enabled: !!user && user.roles?.length > 0,
  });

  // Fetch user-specific module overrides
  const { data: userSpecificAccess, refetch: refetchUserAccess } = useQuery({
    queryKey: ['user-specific-module-access', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('user_module_access')
        // Removing explicit FK hint which seems to be incorrect causing 404
        .select('*, module_definitions(id, name, key)')
        .eq('user_id', user.id);

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
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
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: workspaceDepartments } = useQuery({
    queryKey: ['workspace-departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_departments')
        .select('workspace_id, department_template_id');
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const { data: specialties } = useQuery({
    queryKey: ['specialties-creation', newDepartmentId],
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
          organization_id: newOrganizationId || null,
          workspace_id: newWorkspaceId || null,
          facility_id: newFacilityId || null,
          department_id: newDepartmentId || null,
          specialty_id: newSpecialtyId || null,
          custom_role_id: newCustomRoleId || null,
        });

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['unified-users'] });
      await queryClient.invalidateQueries({ queryKey: ['user-module-access', user.id] });

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (userRoles) {
        onUserUpdate({ ...user, roles: userRoles });
      }

      toast.success('Role added successfully');
      setNewRole('staff');
      setNewOrganizationId('');
      setNewWorkspaceId('');
      setNewFacilityId('');
      setNewDepartmentId('');
      setNewSpecialtyId('');
      setNewCustomRoleId('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to add role');
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ roleId, facilityId, departmentId, specialtyId }: { roleId: string; facilityId: string; departmentId: string; specialtyId: string }) => {
      // If facility changed, get the workspace_id for that facility
      let workspaceId = null;
      if (facilityId) {
        const { data: facility } = await supabase
          .from('facilities')
          .select('workspace_id')
          .eq('id', facilityId)
          .single();
        if (facility) workspaceId = facility.workspace_id;
      }

      // Prepare update object
      const updates: any = {
        department_id: departmentId || null,
        specialty_id: specialtyId || null,
      };

      // Only update facility and workspace if facilityId is provided (or cleared)
      // Note: We might want to allow clearing facility too, but assuming for now edits mean typical re-assignment
      if (facilityId !== undefined) {
        updates.facility_id = facilityId || null;
        if (workspaceId) updates.workspace_id = workspaceId;
      }

      const { error } = await supabase
        .from('user_roles')
        .update(updates)
        .eq('id', roleId);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      await queryClient.invalidateQueries({ queryKey: ['unified-users'] });
      await queryClient.invalidateQueries({ queryKey: ['user-module-access', user.id] });

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id);

      if (userRoles) {
        onUserUpdate({ ...user, roles: userRoles });
      }

      setEditingRoleId(null);
      setEditRoleFacilityId('');
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
      await queryClient.invalidateQueries({ queryKey: ['unified-users'] });
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
    // Validate required fields based on role
    if (['facility_supervisor', 'department_head', 'staff', 'workplace_supervisor'].includes(newRole)) {
      if (!newWorkspaceId) {
        toast.error('Workspace is required for this role');
        return;
      }
      // workplace_supervisor only needs workspace (actually usually facility too unless they manage whole workspace?)
      // Assuming workplace_supervisor manages a workspace, so might not need facility.
      // But facility_supervisor, department_head, staff DEFINITELY need a facility.

      if (['facility_supervisor', 'department_head', 'staff'].includes(newRole) && !newFacilityId) {
        toast.error('Facility is required for this role');
        return;
      }
    }

    addRoleMutation.mutate();
  };

  const handleDeleteRole = (roleId: string) => {
    if (confirm('Are you sure you want to remove this role?')) {
      deleteRoleMutation.mutate(roleId);
    }
  };

  const handleEditRole = (roleData: any) => {
    setEditingRoleId(roleData.id);
    setEditRoleFacilityId(roleData.facility_id || '');
    setEditRoleDepartmentId(roleData.department_id || '');
    setEditRoleSpecialtyId(roleData.specialty_id || '');
  };

  const handleSaveRoleEdit = () => {
    if (editingRoleId) {
      updateRoleMutation.mutate({
        roleId: editingRoleId,
        facilityId: editRoleFacilityId,
        departmentId: editRoleDepartmentId,
        specialtyId: editRoleSpecialtyId,
      });
    }
  };

  const handleCancelRoleEdit = () => {
    setEditingRoleId(null);
    setEditRoleFacilityId('');
    setEditRoleDepartmentId('');
    setEditRoleSpecialtyId('');
  };

  const getFilteredWorkspaces = () => {
    if (!newOrganizationId || !workspaces) return [];
    return workspaces.filter(w => w.organization_id === newOrganizationId);
  };

  const getFilteredFacilities = () => {
    if (!newWorkspaceId || !facilities) return [];
    return facilities.filter(f => f.workspace_id === newWorkspaceId);
  };

  const getFilteredDepartments = () => {
    if (!newWorkspaceId || !departments) return [];

    const facilityName = facilities?.find(f => f.id === newFacilityId)?.name;

    // Get facility specific departments
    const facilityDepts = newFacilityId
      ? departments.filter(d => d.facility_id === newFacilityId)
      : [];

    // Get workspace template departments
    const templateIds = workspaceDepartments
      ?.filter(wd => wd.workspace_id === newWorkspaceId)
      .map(wd => wd.department_template_id) || [];

    let depts = departments.filter(d => templateIds.includes(d.id));

    // If we have facility-specific departments, ONLY show those.
    // Otherwise fall back to workspace templates with category matching.
    let finalDepts = facilityDepts.length > 0 ? facilityDepts : depts;

    if (facilityDepts.length === 0 && facilityName && categories) {
      const matchingCategory = categories.find(cat =>
        facilityName.toLowerCase().includes(cat.name.toLowerCase()) ||
        cat.name.toLowerCase().includes(facilityName.toLowerCase().replace(' facility', '').trim())
      );

      if (matchingCategory) {
        finalDepts = finalDepts.filter(d =>
          d.category?.toLowerCase() === matchingCategory.name.toLowerCase()
        );
      }
    }

    // Build hierarchy/labels if needed
    const processed = finalDepts.map(d => {
      if (d.parent_department_id) {
        const parent = finalDepts.find(p => p.id === d.parent_department_id) ||
          departments.find(p => p.id === d.parent_department_id);
        if (parent) {
          return { ...d, name: `${parent.name} └─ ${d.name}` };
        }
      }
      return d;
    });

    return Array.from(new Map(processed.map(item => [item.id, item])).values());
  };

  const getEditFilteredDepartments = (facilityId: string) => {
    if (!facilityId || !departments) return [];

    const facility = facilities?.find(f => f.id === facilityId);
    const workspaceId = facility?.workspace_id;
    const facilityName = facility?.name;

    // Get facility specific departments
    const facilityDepts = departments.filter(d => d.facility_id === facilityId);

    // Get workspace template departments
    const templateIds = workspaceId && workspaceDepartments
      ? workspaceDepartments
        .filter(wd => wd.workspace_id === workspaceId)
        .map(wd => wd.department_template_id)
      : [];

    let depts = departments.filter(d => templateIds.includes(d.id));

    // If we have facility-specific departments, ONLY show those.
    // Otherwise fall back to workspace templates with category matching.
    let finalDepts = facilityDepts.length > 0 ? facilityDepts : depts;

    if (facilityDepts.length === 0 && facilityName && categories) {
      const matchingCategory = categories.find(cat =>
        facilityName.toLowerCase().includes(cat.name.toLowerCase()) ||
        cat.name.toLowerCase().includes(facilityName.toLowerCase().replace(' facility', '').trim())
      );

      if (matchingCategory) {
        finalDepts = finalDepts.filter(d =>
          d.category?.toLowerCase() === matchingCategory.name.toLowerCase()
        );
      }
    }

    // Build hierarchy/labels if needed
    const processed = finalDepts.map(d => {
      if (d.parent_department_id) {
        const parent = finalDepts.find(p => p.id === d.parent_department_id) ||
          departments.find(p => p.id === d.parent_department_id);
        if (parent) {
          return { ...d, name: `${parent.name} └─ ${d.name}` };
        }
      }
      return d;
    });

    return Array.from(new Map(processed.map(item => [item.id, item])).values());
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
                              <Badge variant="outline">
                                {roleData.role === 'custom' && roleData.custom_role?.name
                                  ? roleData.custom_role.name
                                  : roleData.role === 'workplace_supervisor'
                                    ? 'Workspace Supervisor'
                                    : roleData.role.replace(/_/g, ' ')}
                              </Badge>
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
                                </div>

                                {/* Facility Select for Editing */}
                                <div className="space-y-2">
                                  <Label>Facility</Label>
                                  <Select
                                    value={editRoleFacilityId}
                                    onValueChange={(val) => {
                                      setEditRoleFacilityId(val);
                                      setEditRoleDepartmentId('');
                                      setEditRoleSpecialtyId('');
                                    }}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select facility" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {/* Show facilities from the same workspace OR all facilities if current one is not found (fallback) */}
                                      {roleData.workspace_id && facilities?.filter(f => f.workspace_id === roleData.workspace_id).map((facility) => (
                                        <SelectItem key={facility.id} value={facility.id}>
                                          {facility.name}
                                        </SelectItem>
                                      ))}
                                      {/* If no workspace assigned or fallback needed, show all (or filtered by admin access which is already done in fetching) */}
                                      {(!roleData.workspace_id) && facilities?.map(facility => (
                                        <SelectItem key={facility.id} value={facility.id}>
                                          {facility.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>

                                {/* Department Select (Depends on Edit Facility ID) */}
                                {editRoleFacilityId && (
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
                                        {getEditFilteredDepartments(editRoleFacilityId).length > 0 ? (
                                          getEditFilteredDepartments(editRoleFacilityId).map((dept) => (
                                            <SelectItem key={dept.id} value={dept.id}>
                                              {dept.name}
                                            </SelectItem>
                                          ))
                                        ) : (
                                          <SelectItem value="no-depts" disabled>No departments found</SelectItem>
                                        )}
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
                    <Select value={newCustomRoleId || newRole} onValueChange={handleNewRoleChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                        <SelectItem value="organization_admin">Organization Admin</SelectItem>
                        <SelectItem value="general_admin">General Admin</SelectItem>
                        <SelectItem value="workplace_supervisor">Workspace Supervisor</SelectItem>
                        <SelectItem value="facility_supervisor">Facility Supervisor</SelectItem>
                        <SelectItem value="department_head">Department Head</SelectItem>
                        <SelectItem value="staff">Staff</SelectItem>
                        {customRoles?.map((cr) => (
                          <SelectItem key={cr.id} value={cr.id}>
                            {cr.name} (Custom)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {newRole !== 'super_admin' && newRole !== 'general_admin' && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground border-t pt-4">
                        <Building2 className="h-4 w-4" />
                        Organization & Scope Assignment
                      </div>

                      <div className="space-y-2">
                        <Label>Organization *</Label>
                        <Select value={newOrganizationId} onValueChange={(val) => {
                          setNewOrganizationId(val);
                          setNewWorkspaceId('');
                          setNewFacilityId('');
                          setNewDepartmentId('');
                          setNewSpecialtyId('');
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select organization" />
                          </SelectTrigger>
                          <SelectContent>
                            {organizations?.map((org: any) => (
                              <SelectItem key={org.id} value={org.id}>
                                {org.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {['workplace_supervisor', 'facility_supervisor', 'department_head', 'staff', 'intern', 'workspace_supervisor', 'custom'].includes(newRole) && (
                        <div className="space-y-2">
                          <Label>Workspace *</Label>
                          <Select value={newWorkspaceId} onValueChange={(val) => {
                            setNewWorkspaceId(val);
                            setNewFacilityId('');
                            setNewDepartmentId('');
                            setNewSpecialtyId('');
                          }} disabled={!newOrganizationId && newRole !== 'general_admin'}>
                            <SelectTrigger>
                              <SelectValue placeholder={!newOrganizationId && newRole !== 'general_admin' ? "Select organization first" : "Select workspace"} />
                            </SelectTrigger>
                            <SelectContent>
                              {newRole === 'general_admin' ? (
                                workspaces?.map((workspace) => (
                                  <SelectItem key={workspace.id} value={workspace.id}>
                                    {workspace.name}
                                  </SelectItem>
                                ))
                              ) : (
                                getFilteredWorkspaces().map((workspace) => (
                                  <SelectItem key={workspace.id} value={workspace.id}>
                                    {workspace.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {newWorkspaceId && ['facility_supervisor', 'department_head', 'staff', 'custom'].includes(newRole) && (
                        <div className="space-y-2">
                          <Label>Facility *</Label>
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

                      {newFacilityId && ['facility_supervisor', 'department_head', 'staff', 'intern', 'custom'].includes(newRole) && (
                        <div className="space-y-2">
                          <Label>Department {['facility_supervisor'].includes(newRole) ? '(Optional)' : '*'}</Label>
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

                      {newDepartmentId && specialties && specialties.length > 0 && ['staff', 'intern', 'custom'].includes(newRole) && (
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
                    </div>
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

            {/* Module Permissions Section - Only show in full mode */}
            {mode === 'full' && (
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Module Access Permissions</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Permissions are derived from roles. User-specific overrides take priority.
                  </p>
                </div>

                {/* User-specific overrides indicator */}
                {userSpecificAccess && userSpecificAccess.length > 0 && (
                  <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4">
                    <p className="text-sm font-medium text-primary flex items-center gap-2">
                      <Badge variant="outline" className="bg-primary/20">Override</Badge>
                      This user has {userSpecificAccess.length} custom module permission(s)
                    </p>
                    <ul className="mt-2 text-sm text-muted-foreground space-y-1">
                      {userSpecificAccess.map((access: any) => (
                        <li key={access.id} className="flex items-center gap-2">
                          • {access.module_definitions?.name}:
                          {access.can_view && <Badge variant="secondary" className="text-xs">View</Badge>}
                          {access.can_edit && <Badge variant="secondary" className="text-xs">Edit</Badge>}
                          {access.can_delete && <Badge variant="secondary" className="text-xs">Delete</Badge>}
                          {access.can_admin && <Badge variant="secondary" className="text-xs">Admin</Badge>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {moduleAccessByModule && Object.keys(moduleAccessByModule).length > 0 ? (
                  <div className="space-y-3">
                    {Object.values(moduleAccessByModule).map((access: any) => {
                      const hasOverride = userSpecificAccess?.some(
                        (ua: any) => ua.module_id === access.module.id
                      );

                      return (
                        <div key={access.module.id} className={`border rounded-lg p-4 ${hasOverride ? 'border-primary/50 bg-primary/5' : ''}`}>
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{access.module.name}</h4>
                                {hasOverride && <Badge variant="outline" className="text-xs">Has Override</Badge>}
                              </div>
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
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No module permissions assigned (no roles assigned)</p>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog >
  );
};

export default UserEditDialog;
