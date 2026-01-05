import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Filter, Pencil, Trash2, FileSpreadsheet } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { useModuleContext } from '@/contexts/ModuleContext';
import { DataTable, Column } from '@/components/shared/DataTable';
import { ActionButton } from '@/components/shared/ActionButton';
import UnifiedUserCreation from '@/components/admin/UnifiedUserCreation';
import BulkUserUpload from '@/components/admin/BulkUserUpload';
import UserEditDialog from '@/components/admin/UserEditDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';

interface UnifiedUserHubProps {
  scope?: 'system' | 'workspace' | 'facility' | 'department';
  scopeId?: string; // workspace_id, facility_id, or department_id
  mode?: 'super_admin' | 'organization_admin' | 'scoped';
  organizationId?: string;
  maxUsers?: number | null;
  currentUserCount?: number;
}

const UnifiedUserHub = ({ scope, scopeId, mode, organizationId, maxUsers, currentUserCount }: UnifiedUserHubProps) => {
  const [unifiedCreateOpen, setUnifiedCreateOpen] = useState(false);
  const [filterWorkspace, setFilterWorkspace] = useState<string>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: userRoles } = useUserRole();
  const { canEdit, canDelete, canAdmin } = useModuleContext();

  // Auto-detect scope from user's role if not provided
  const detectedScope: 'system' | 'workspace' | 'facility' | 'department' =
    scope || (userRoles?.[0]?.role === 'super_admin' ? 'system' :
      userRoles?.[0]?.role === 'department_head' ? 'department' : 'system');
  const detectedScopeId = scopeId || userRoles?.[0]?.department_id || userRoles?.[0]?.facility_id || userRoles?.[0]?.workspace_id;

  // Check permissions for user management module
  const hasViewPermission = true; // If they're on this page, they have view
  const hasEditPermission = canEdit('user_management') || canEdit('staff_management');
  const hasDeletePermission = canDelete('user_management') || canDelete('staff_management');
  const hasAdminPermission = canAdmin('user_management');
  const hasBulkUpload = hasAdminPermission;

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
    enabled: detectedScope === 'system',
  });

  // Fetch all departments including specialties for display
  const { data: allDepartments } = useQuery({
    queryKey: ['all-departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['unified-users', detectedScope, detectedScopeId, filterWorkspace],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: profiles, error: profilesError } = await query;
      if (profilesError) throw profilesError;

      // Fetch all user roles
      const { data: allUserRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      if (rolesError) throw rolesError;

      // Filter profiles based on scope
      let filteredProfiles = profiles || [];

      if (detectedScope === 'department' && detectedScopeId) {
        // Department Heads see staff in their department
        const departmentRoles = allUserRoles?.filter(
          (ur) => ur.department_id === detectedScopeId &&
            (ur.role === 'staff' || ur.role === 'department_head')
        );
        const userIds = departmentRoles?.map((ur) => ur.user_id) || [];
        filteredProfiles = profiles?.filter((p) => userIds.includes(p.id)) || [];
      } else if (detectedScope === 'facility' && detectedScopeId) {
        // Facility supervisors see users in their facility
        const facilityRoles = allUserRoles?.filter((ur) => ur.facility_id === detectedScopeId);
        const userIds = facilityRoles?.map((ur) => ur.user_id) || [];
        filteredProfiles = profiles?.filter((p) => userIds.includes(p.id)) || [];
      } else if (detectedScope === 'workspace' && detectedScopeId) {
        // Workspace admins see users in their workspace
        const workspaceRoles = allUserRoles?.filter((ur) => ur.workspace_id === detectedScopeId);
        const userIds = workspaceRoles?.map((ur) => ur.user_id) || [];
        filteredProfiles = profiles?.filter((p) => userIds.includes(p.id)) || [];
      }

      // Apply workspace filter if selected
      if (filterWorkspace && filterWorkspace !== 'all') {
        const workspaceRoles = allUserRoles?.filter((ur) => ur.workspace_id === filterWorkspace);
        const userIds = workspaceRoles?.map((ur) => ur.user_id) || [];
        filteredProfiles = filteredProfiles?.filter((p) => userIds.includes(p.id)) || [];
      }

      // Combine profiles with their roles
      const usersWithRoles = filteredProfiles?.map((profile) => {
        const roles = allUserRoles?.filter((ur) => ur.user_id === profile.id) || [];
        return {
          ...profile,
          roles,
        };
      });

      return usersWithRoles;
    },
  });

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setEditOpen(true);
  };

  const handleUserUpdate = (updatedUser: any) => {
    setEditingUser(updatedUser);
  };

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (error) throw error;
    },
    onMutate: async ({ userId, isActive }) => {
      await queryClient.cancelQueries({ queryKey: ['unified-users'] });

      const previousUsers = queryClient.getQueryData(['unified-users', detectedScope, detectedScopeId, filterWorkspace]);

      queryClient.setQueryData(
        ['unified-users', detectedScope, detectedScopeId, filterWorkspace],
        (old: any) => old?.map((u: any) => u.id === userId ? { ...u, is_active: isActive } : u)
      );

      return { previousUsers };
    },
    onSuccess: (_, variables) => {
      toast.success(`User ${variables.isActive ? 'activated' : 'deactivated'}`);
      // Refresh to ensure sync with server
      queryClient.invalidateQueries({ queryKey: ['unified-users'] });
    },
    onError: (error: Error, _, context: any) => {
      if (context?.previousUsers) {
        queryClient.setQueryData(
          ['unified-users', detectedScope, detectedScopeId, filterWorkspace],
          context.previousUsers
        );
      }
      toast.error(`Failed to update status: ${error.message}`);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // Delete user_roles first (cascading should handle this but being explicit)
      const { error: rolesError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (rolesError) throw rolesError;
    },
    onSuccess: () => {
      toast.success('User removed successfully');
      queryClient.invalidateQueries({ queryKey: ['unified-users'] });
      setDeleteUserId(null);
    },
    onError: (error: Error) => {
      toast.error(`Failed to remove user: ${error.message}`);
    },
  });

  const handleToggleActive = (userId: string, currentStatus: boolean) => {
    toggleActiveMutation.mutate({ userId, isActive: !currentStatus });
  };

  const handleDeleteClick = (userId: string) => {
    setDeleteUserId(userId);
  };

  const handleDeleteConfirm = () => {
    if (deleteUserId) {
      deleteUserMutation.mutate(deleteUserId);
    }
  };

  // Define columns based on permissions and scope
  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (row) => <span className="font-medium">{row.full_name}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      cell: (row) => row.email,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="flex items-center gap-2">
          {hasEditPermission ? (
            <>
              <Switch
                checked={row.is_active ?? false}
                onCheckedChange={() => handleToggleActive(row.id, row.is_active ?? false)}
                disabled={toggleActiveMutation.isPending}
              />
              <span className="text-sm text-muted-foreground">
                {row.is_active ? 'Active' : 'Inactive'}
              </span>
            </>
          ) : (
            <Badge variant={row.is_active ? 'default' : 'secondary'}>
              {row.is_active ? 'Active' : 'Inactive'}
            </Badge>
          )}
        </div>
      ),
    },
  ];

  // Add Roles column if user has admin permission (system-wide view)
  if (hasAdminPermission && detectedScope === 'system') {
    columns.push({
      key: 'roles',
      header: 'Roles',
      cell: (row) => (
        <div className="flex flex-wrap gap-1 min-w-[150px]">
          {row.roles.map((roleData: any, idx: number) => (
            <Badge key={idx} variant="outline">
              {roleData.role.replace(/_/g, ' ')}
            </Badge>
          ))}
          {row.roles.length === 0 && (
            <span className="text-xs text-muted-foreground">No roles</span>
          )}
        </div>
      ),
    });
  }

  // Add Specialty column for department scope
  if (detectedScope === 'department') {
    columns.push({
      key: 'specialty',
      header: 'Specialty',
      cell: (row) => {
        const departmentRole = row.roles.find((r: any) => r.department_id === detectedScopeId);
        if (!departmentRole?.specialty_id) {
          return <span className="text-xs text-muted-foreground">Not assigned</span>;
        }

        const specialty = allDepartments?.find((d) => d.id === departmentRole.specialty_id);
        return specialty ? (
          <Badge variant="outline">{specialty.name}</Badge>
        ) : (
          <Badge variant="outline" className="opacity-50">Unknown specialty</Badge>
        );
      },
    });
  }

  // Add Workspaces column if system-wide view
  if (hasAdminPermission && detectedScope === 'system') {
    columns.push({
      key: 'workspaces',
      header: 'Workspaces',
      cell: (row) => (
        <div className="flex flex-wrap gap-1 min-w-[120px]">
          {row.roles
            .filter((roleData: any) => roleData.workspace_id)
            .map((roleData: any, idx: number) => {
              const workspace = workspaces?.find((w: any) => w.id === roleData.workspace_id);
              if (!workspace) return null;
              return (
                <Badge key={idx} className="bg-primary/10">
                  {workspace.name}
                </Badge>
              );
            })
            .filter(Boolean)}
          {row.roles.every((r: any) => !r.workspace_id) && (
            <span className="text-xs text-muted-foreground">System-wide</span>
          )}
        </div>
      ),
    });
  }

  // Add Actions column
  columns.push({
    key: 'actions',
    header: 'Actions',
    cell: (row) => (
      <div className="flex items-center gap-1 justify-end">
        {hasEditPermission && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleEdit(row)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {hasDeletePermission && detectedScope === 'department' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteClick(row.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>
    ),
  });

  const scopeTitle = detectedScope === 'department' ? 'Staff Management' : 'User Management';
  const scopeDescription = detectedScope === 'department'
    ? 'Manage staff members in your department'
    : 'Create and manage user accounts';

  // Check if user limit is reached
  const isAtUserLimit = maxUsers !== null && maxUsers !== undefined && (currentUserCount || 0) >= maxUsers;

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="User Management Error"
          message="Failed to load user management"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <>
        <UnifiedUserCreation open={unifiedCreateOpen} onOpenChange={setUnifiedCreateOpen} />
        <UserEditDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          user={editingUser}
          onUserUpdate={handleUserUpdate}
          mode={detectedScope === 'department' ? 'scoped' : 'full'}
        />

        <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove User</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove this user from the department? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground">
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Card className="border-2">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg sm:text-xl">{scopeTitle}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  {scopeDescription}
                  {maxUsers !== null && maxUsers !== undefined && (
                    <span className="ml-2 text-muted-foreground">
                      ({currentUserCount || 0} / {maxUsers} users)
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                {hasEditPermission && (
                  <ActionButton
                    onClick={() => setUnifiedCreateOpen(true)}
                    className="bg-gradient-primary w-full sm:w-auto min-h-[44px]"
                    disabled={isAtUserLimit}
                    title={isAtUserLimit ? 'User limit reached' : undefined}
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    <span className="sm:inline">{detectedScope === 'department' ? 'Add Staff' : 'Create User'}</span>
                  </ActionButton>
                )}
              </div>
            </div>
            {isAtUserLimit && (
              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
                User limit reached. Contact your administrator to increase the limit.
              </div>
            )}
          </CardHeader>
          <CardContent>
            {hasBulkUpload && detectedScope === 'system' ? (
              <Tabs defaultValue="list" className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="list">
                    <Filter className="h-4 w-4 mr-2" />
                    User List
                  </TabsTrigger>
                  <TabsTrigger value="bulk">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Bulk Upload
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                  {detectedScope === 'system' && (
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
                  )}

                  <DataTable
                    data={users}
                    columns={columns}
                    isLoading={usersLoading}
                    error={usersError as Error}
                    emptyState={{
                      title: 'No users found',
                      description: (detectedScope as string) === 'department'
                        ? 'Add staff members to your department to get started.'
                        : 'Create your first user to get started.',
                      action: hasEditPermission ? {
                        label: (detectedScope as string) === 'department' ? 'Add Staff' : 'Create User',
                        onClick: () => setUnifiedCreateOpen(true),
                      } : undefined,
                    }}
                  />
                </TabsContent>

                <TabsContent value="bulk">
                  <BulkUserUpload />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-4">
                {detectedScope === 'system' && (
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
                )}

                <DataTable
                  data={users}
                  columns={columns}
                  isLoading={usersLoading}
                  error={usersError as Error}
                  emptyState={{
                    title: 'No users found',
                    description: detectedScope === 'department'
                      ? 'Add staff members to your department to get started.'
                      : 'Create your first user to get started.',
                    action: hasEditPermission ? {
                      label: detectedScope === 'department' ? 'Add Staff' : 'Create User',
                      onClick: () => setUnifiedCreateOpen(true),
                    } : undefined,
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </>
    </ErrorBoundary>
  );
};

export default UnifiedUserHub;
