import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserPlus, Filter, Pencil, Trash2, FileSpreadsheet, Lock } from 'lucide-react';
import { format } from 'date-fns';
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
import { useOrganization } from '@/contexts/OrganizationContext';

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
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: userRoles } = useUserRole();
  const { canEdit, canDelete, canAdmin } = useModuleContext();

  // Check if current user is super admin
  const isSuperAdmin = userRoles?.some(r => r.role === 'super_admin');

  // Auto-detect scope from user's role if not provided
  const detectedScope: 'system' | 'workspace' | 'facility' | 'department' =
    scope || (userRoles?.[0]?.role === 'super_admin' ? 'system' :
      userRoles?.[0]?.role === 'department_head' ? 'department' : 'system');
  const detectedScopeId = scopeId || userRoles?.[0]?.department_id || userRoles?.[0]?.facility_id || userRoles?.[0]?.workspace_id;

  const { selectedOrganizationId } = useOrganization();

  // Use prop if provided (scoped view), otherwise use context (super admin switcher)
  const activeOrganizationId = organizationId || selectedOrganizationId;

  // Check permissions for user management module
  const hasViewPermission = true; // If they're on this page, they have view
  const hasEditPermission = canEdit('user_management') || canEdit('staff_management');
  const hasDeletePermission = canDelete('user_management') || canDelete('staff_management');
  const hasAdminPermission = canAdmin('user_management');
  const hasBulkUpload = hasAdminPermission;

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces', activeOrganizationId],
    queryFn: async () => {
      let query = supabase
        .from('workspaces')
        .select('*')
        .order('name');

      if (activeOrganizationId && activeOrganizationId !== 'all') {
        query = query.eq('organization_id', activeOrganizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: detectedScope === 'system',
  });

  // Fetch all departments including specialties for display, filtered by org
  const { data: allDepartments } = useQuery({
    queryKey: ['all-departments', activeOrganizationId],
    queryFn: async () => {
      let query = supabase
        .from('departments')
        .select('*, facilities(workspace_id, workspaces(organization_id))')
        .order('name');

      if (activeOrganizationId && activeOrganizationId !== 'all') {
        query = query.eq('facilities.workspaces.organization_id', activeOrganizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['unified-users', detectedScope, detectedScopeId, activeOrganizationId, filterWorkspace, filterDepartment],
    queryFn: async () => {
      // Build optimized query based on scope
      let query = supabase
        .from('profiles')
        .select(`
          *,
          user_roles!inner(
            *,
            custom_role:custom_roles(id, name)
          )
        `)
        .order('created_at', { ascending: false });

      if (detectedScope === 'department' && detectedScopeId) {
        query = query
          .eq('user_roles.department_id', detectedScopeId)
          .in('user_roles.role', ['staff', 'department_head']);
      } else if (detectedScope === 'facility' && detectedScopeId) {
        query = query.eq('user_roles.facility_id', detectedScopeId);
      } else if (detectedScope === 'workspace' && detectedScopeId) {
        query = query.eq('user_roles.workspace_id', detectedScopeId);
      } else if (activeOrganizationId && activeOrganizationId !== 'all') {
        // Core organization filter - always apply if we have an org context (and it's not 'all')
        // This ensures we normally don't leak users across organizations, but allows 'all' for super admins
        query = query.eq('user_roles.organization_id', activeOrganizationId);
      }

      const { data: profilesWithRoles, error: queryError } = await query;
      if (queryError) throw queryError;

      // Map back to the structure the component expects
      return (profilesWithRoles || []).map((p: any) => ({
        ...p,
        roles: p.user_roles || []
      }));
    },
  });

  // Secondary filters (dropdowns)
  const filteredProfiles = (users || []).filter((user: any) => {
    // Apply workspace filter
    if (filterWorkspace && filterWorkspace !== 'all') {
      if (!user.roles.some((r: any) => r.workspace_id === filterWorkspace)) {
        return false;
      }
    }

    // Apply department filter
    if (filterDepartment && filterDepartment !== 'all') {
      if (!user.roles.some((r: any) => r.department_id === filterDepartment)) {
        return false;
      }
    }

    return true;
  });

  // Fetch rate limits for super admin
  const { data: rateLimits } = useQuery({
    queryKey: ['rate-limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_limits')
        .select('*')
        .order('window_start', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin && detectedScope === 'system',
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
      if (isSuperAdmin) {
        // Get the current session to pass the access token
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Not authenticated. Please log in again.');
        }

        // Use Edge Function only (RPC fallback disabled)
        const { data, error } = await supabase.functions.invoke('delete-user', {
          body: { userId }
        });

        if (error) {
          throw error;
        }
        return data;
      } else {
        // Department scopes removal (original logic)
        const { error: rolesError } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId);

        if (rolesError) throw rolesError;
      }
    },
    onSuccess: () => {
      toast.success('User removed successfully');
      queryClient.invalidateQueries({ queryKey: ['unified-users'] });
      setDeleteUserId(null);
    },
    onError: async (error: any) => {
      let errorMessage = 'Failed to remove user';

      // Attempt to extract verbose error from Edge Function response
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          if (body.error) {
            errorMessage = body.error;
            if (body.details) errorMessage += `: ${body.details}`;
            if (body.hint) errorMessage += ` (Hint: ${body.hint})`;
          }
        } catch (e) {
          errorMessage = error.message || errorMessage;
        }
      } else {
        errorMessage = error.message || errorMessage;
      }

      toast.error(errorMessage);
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
              {roleData.role === 'custom' && roleData.custom_role?.name
                ? roleData.custom_role.name
                : roleData.role === 'workplace_supervisor'
                  ? 'Workspace Supervisor'
                  : roleData.role.replace(/_/g, ' ')}
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
                <Badge key={idx} className="bg-primary">
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
        {(hasDeletePermission && detectedScope === 'department') || isSuperAdmin ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleDeleteClick(row.id)}
            disabled={deleteUserMutation.isPending && deleteUserId === row.id}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        ) : null}
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
        <UnifiedUserCreation
          open={unifiedCreateOpen}
          onOpenChange={setUnifiedCreateOpen}
          initialOrganizationId={activeOrganizationId === 'all' ? undefined : activeOrganizationId}
        />
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
              <AlertDialogTitle>{isSuperAdmin ? 'Permanently Delete User' : 'Remove User'}</AlertDialogTitle>
              <AlertDialogDescription>
                {isSuperAdmin
                  ? "Are you sure you want to permanently delete this user from the entire system? This action cannot be undone and will remove all their data and access."
                  : "Are you sure you want to remove this user from the department? This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isSuperAdmin ? 'Delete Permanently' : 'Remove'}
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
                <TabsList className="inline-flex h-auto gap-1 w-auto">
                  <TabsTrigger value="list" className="min-h-[40px] px-4 text-sm">
                    <Filter className="h-4 w-4 mr-2 shrink-0" />
                    User List
                  </TabsTrigger>
                  <TabsTrigger value="bulk" className="min-h-[40px] px-4 text-sm">
                    <FileSpreadsheet className="h-4 w-4 mr-2 shrink-0" />
                    Bulk Upload
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="list" className="space-y-4">
                  {detectedScope === 'system' && (
                    <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Label className="text-sm whitespace-nowrap shrink-0">Workspace:</Label>
                        <Select value={filterWorkspace} onValueChange={setFilterWorkspace}>
                          <SelectTrigger className="w-[180px] min-h-[40px]">
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

                      {isSuperAdmin && (
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Label className="text-sm whitespace-nowrap shrink-0">Department:</Label>
                          <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                            <SelectTrigger className="w-[180px] min-h-[40px]">
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Departments</SelectItem>
                              {allDepartments?.map((department) => (
                                <SelectItem key={department.id} value={department.id}>
                                  {department.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}

                  <DataTable
                    data={filteredProfiles}
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
                  <BulkUserUpload organizationId={activeOrganizationId === 'all' ? undefined : activeOrganizationId} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-4">
                {detectedScope === 'system' && (
                  <div className="flex flex-col gap-3 sm:gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                      <div className="flex items-center gap-2 shrink-0">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <Label className="text-sm whitespace-nowrap">Workspace:</Label>
                      </div>
                      <Select value={filterWorkspace} onValueChange={setFilterWorkspace}>
                        <SelectTrigger className="w-full sm:w-48 md:w-64 min-h-[44px]">
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

                    {isSuperAdmin && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
                        <div className="flex items-center gap-2 shrink-0">
                          <Filter className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-sm whitespace-nowrap">Department:</Label>
                        </div>
                        <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                          <SelectTrigger className="w-full sm:w-48 md:w-64 min-h-[44px]">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Departments</SelectItem>
                            {allDepartments?.map((department) => (
                              <SelectItem key={department.id} value={department.id}>
                                {department.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}

                <DataTable
                  data={filteredProfiles}
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

        {/* Rate Limit Activity - Super Admin Only */}
        {isSuperAdmin && detectedScope === 'system' && (
          <Card className="border-2 mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Rate Limit Activity
              </CardTitle>
              <CardDescription>Recent rate limiting events and blocked requests</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identifier</TableHead>
                      <TableHead>Action Type</TableHead>
                      <TableHead>Request Count</TableHead>
                      <TableHead>Window Start</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateLimits?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No rate limit events recorded
                        </TableCell>
                      </TableRow>
                    ) : (
                      rateLimits?.map(limit => (
                        <TableRow key={limit.id}>
                          <TableCell className="font-mono text-xs">{limit.identifier.slice(0, 20)}...</TableCell>
                          <TableCell>
                            <Badge variant="outline">{limit.action_type}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className={(limit.request_count || 0) >= 10 ? 'text-red-500 font-bold' : ''}>
                              {limit.request_count}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {limit.window_start ? format(new Date(limit.window_start), 'MMM d, HH:mm:ss') : '-'}
                          </TableCell>
                          <TableCell>
                            {(limit.request_count || 0) >= 10 ? (
                              <Badge className="bg-red-500/20 text-red-400">Blocked</Badge>
                            ) : (
                              <Badge className="bg-green-500/20 text-green-400">Active</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </>
    </ErrorBoundary>
  );
};

export default UnifiedUserHub;
