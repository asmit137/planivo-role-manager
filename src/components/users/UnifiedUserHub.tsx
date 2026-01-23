import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { UserPlus, RefreshCw, Pencil, Trash2, FileSpreadsheet, Lock, Filter, XCircle, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { useModuleContext } from '@/contexts/ModuleContext';
import { DataTable, Column } from '@/components/shared/DataTable';
import { ActionButton } from '@/components/shared/ActionButton';
import UnifiedUserCreation from '@/components/admin/UnifiedUserCreation';
import { SearchableSelect } from '@/components/ui/searchable-select';
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

const UnifiedUserHub = ({
  scope,
  scopeId,
  mode,
  organizationId,
  maxUsers,
  currentUserCount
}: UnifiedUserHubProps) => {
  const [unifiedCreateOpen, setUnifiedCreateOpen] = useState(false);
  const [filterWorkspace, setFilterWorkspace] = useState<string>('all');
  const [filterDepartment, setFilterDepartment] = useState<string>('all');
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const { data: userRoles } = useUserRole();
  const { canEdit, canDelete, canAdmin } = useModuleContext();

  // Check if current user is super admin
  const isSuperAdmin = userRoles?.some(r => r.role === 'super_admin' || r.role === 'general_admin');

  // Improved Scope Detection
  const superAdminRole = userRoles?.find(r => r.role === 'super_admin' || r.role === 'organization_admin');
  const deptHeadRole = userRoles?.find(r => r.role === 'department_head');
  const facilitySuperRole = userRoles?.find(r => r.role === 'facility_supervisor');
  const workspaceSuperRole = userRoles?.find(r => r.role === 'workplace_supervisor' || r.role === 'workspace_supervisor');

  const detectedScope: 'system' | 'workspace' | 'facility' | 'department' = scope || (
    superAdminRole ? 'system' :
      deptHeadRole ? 'department' :
        facilitySuperRole ? 'facility' :
          workspaceSuperRole ? 'workspace' : 'system'
  );

  const detectedScopeId = scopeId || (
    detectedScope === 'department' ? deptHeadRole?.department_id :
      detectedScope === 'facility' ? facilitySuperRole?.facility_id :
        detectedScope === 'workspace' ? workspaceSuperRole?.workspace_id :
          undefined
  );

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
      // If filtering by organization, first get workspace IDs for that organization
      if (activeOrganizationId && activeOrganizationId !== 'all') {
        // Get workspaces for this organization
        const { data: workspaces, error: workspaceError } = await supabase
          .from('workspaces')
          .select('id')
          .eq('organization_id', activeOrganizationId);

        if (workspaceError) throw workspaceError;

        const workspaceIds = workspaces?.map(w => w.id) || [];

        if (workspaceIds.length === 0) {
          return []; // No workspaces, so no departments
        }

        // Get facilities for these workspaces
        const { data: facilities, error: facilityError } = await supabase
          .from('facilities')
          .select('id')
          .in('workspace_id', workspaceIds);

        if (facilityError) throw facilityError;

        const facilityIds = facilities?.map(f => f.id) || [];

        if (facilityIds.length === 0) {
          return []; // No facilities, so no departments
        }

        // Get departments for these facilities
        const { data, error } = await supabase
          .from('departments')
          .select('*, facilities(name, workspace_id)')
          .in('facility_id', facilityIds)
          .order('name');

        if (error) throw error;
        return data;
      }

      // No organization filter - get all departments
      const { data, error } = await supabase
        .from('departments')
        .select('*, facilities(name, workspace_id)')
        .order('name');

      if (error) throw error;
      return data;
    },
  });

  // console.log("allDepartments", allDepartments);
  // console.log("activeOrganizationId", activeOrganizationId);

  const { data: users, isLoading: usersLoading, error: usersError } = useQuery({
    queryKey: ['unified-users', detectedScope, detectedScopeId, activeOrganizationId, filterWorkspace, filterDepartment],
    queryFn: async () => {
      // console.log(`[UnifiedUserHub] Scope: ${detectedScope}, ScopeId: ${detectedScopeId}, OrgId: ${activeOrganizationId} `);

      // Build optimized query based on scope
      // Use !inner for scoped views to filter profiles to those in the scope
      // Use !inner if an organization is selected to prevent leaking all users
      // Use left join (default) for system view with 'all' organizations to include users without roles
      const isFilteredByOrg = activeOrganizationId && activeOrganizationId !== 'all';
      const joinType = (detectedScope && detectedScope !== 'system') || isFilteredByOrg ? '!inner' : '';

      let query = supabase
        .from('profiles')
        .select(`
  *,
  user_roles${joinType} (
            *,
    custom_role: custom_roles(id, name)
          )
`)
        .order('created_at', { ascending: false });

      if (detectedScope === 'department' && detectedScopeId) {
        // console.log(`[UnifiedUserHub] Filtering by Department: ${detectedScopeId} `);
        query = query
          .eq('user_roles.department_id', detectedScopeId);
      } else if (detectedScope === 'facility' && detectedScopeId) {
        query = query.eq('user_roles.facility_id', detectedScopeId);
      } else if (detectedScope === 'workspace' && detectedScopeId) {
        query = query.eq('user_roles.workspace_id', detectedScopeId);
      } else if (isFilteredByOrg) {
        // Core organization filter - always apply if we have an org context (and it's not 'all')
        // This ensures we normally don't leak users across organizations, but allows 'all' for super admins
        query = query.eq('user_roles.organization_id', activeOrganizationId);
      }

      const { data: profilesWithRoles, error: queryError } = await query;
      if (queryError) {
        console.error('[UnifiedUserHub] Query Error:', queryError);
        throw queryError;
      }

      // console.log(`[UnifiedUserHub] Fetched ${profilesWithRoles?.length} users`);

      // Map back to the structure the component expects
      return (profilesWithRoles || []).map((p: any) => ({
        ...p,
        roles: p.user_roles || []
      }));
    },
  });

  const handleManualRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['unified-users'] });
    toast.info('Refreshing user list...');
  };

  // Secondary filters (dropdowns)
  const filteredProfiles = (users || []).filter((user: any) => {
    // Filter out Department Heads from the list if we are in Department scope
    // This ensures Department Heads don't see themselves or other DHs in the "Staff" list
    if (detectedScope === 'department') {
      if (user.roles.some((r: any) => r.role === 'department_head')) {
        return false;
      }
    }

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

    // Apply search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const nameMatch = user.full_name?.toLowerCase().includes(query);
      const emailMatch = user.email?.toLowerCase().includes(query);
      if (!nameMatch && !emailMatch) return false;
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
      toast.success(`User ${variables.isActive ? 'activated' : 'deactivated'} `);
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
      toast.error(`Failed to update status: ${error.message} `);
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
          body: { userId },
          headers: {
            Authorization: `Bearer ${session.access_token}`
          }
        });

        if (error) {
          console.error("Delete user error:", error);
          let errorMessage = error.message;

          if (error.context && typeof error.context.json === 'function') {
            try {
              const body = await error.context.json();
              // console.log("Delete error body:", body);
              if (body.error) errorMessage = body.error;
            } catch (e) {
              console.error("Failed to parse delete error body", e);
            }
          }
          throw new Error(errorMessage);
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
      // Don't close the dialog automatically on error so user can see it if we display it in dialog, 
      // but usually toast is enough. User might want to try again.
      // However, the current logic resets deleteUserId in handleConfirm usually.
      // I'll keep it open on error so they can try again if it was a transient error.
      let errorMessage = 'Failed to remove user';

      // Attempt to extract verbose error from Edge Function response
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.json();
          if (body.error) {
            errorMessage = body.error;
            if (body.details) errorMessage += `: ${body.details} `;
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
        <div className="flex flex-wrap gap-1">
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
        const facilityName = (specialty as any)?.facilities?.name;

        return (
          <div className="flex flex-col gap-1">
            <Badge variant="outline">{specialty ? specialty.name : 'Unknown specialty'}</Badge>
            {facilityName && (
              <span className="text-[10px] text-muted-foreground italic">
                ({facilityName})
              </span>
            )}
          </div>
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
        <div className="flex flex-wrap gap-1">
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
  // Hide Actions column for Workspace and Facility Supervisors as requested
  if (isSuperAdmin || (detectedScope !== 'workspace' && detectedScope !== 'facility')) {
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
  }

  const scopeTitle = detectedScope === 'department' ? 'Staff Management' : 'User Management';
  const scopeDescription = detectedScope === 'department'
    ? 'Manage staff members in your department'
    : 'Create and manage user accounts';

  // Check if user limit is reached
  const isAtUserLimit = maxUsers !== null && maxUsers !== undefined && (currentUserCount || 0) >= maxUsers;

  // Mobilized user card component
  const UserCard = ({ user }: { user: any }) => {
    return (
      <Card className="mb-3 border border-border/60 bg-card/50 hover:border-primary/40 transition-all duration-200">
        <CardContent className="p-3 sm:p-4">
          <div className="flex justify-between items-start mb-2 gap-2">
            <div className="space-y-0.5 min-w-0 flex-1">
              <h4 className="font-semibold text-sm sm:text-[15px] leading-tight truncate">{user.full_name}</h4>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <div className="shrink-0 pt-0.5">
              {hasEditPermission ? (
                <Switch
                  checked={user.is_active ?? false}
                  onCheckedChange={() => handleToggleActive(user.id, user.is_active ?? false)}
                  disabled={toggleActiveMutation.isPending}
                  className="scale-90 sm:scale-100"
                />
              ) : (
                <Badge variant={user.is_active ? 'default' : 'secondary'} className="text-[9px] sm:text-[10px] h-4 sm:h-5 px-1.5 font-normal">
                  {user.is_active ? 'Active' : 'Inactive'}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mt-2.5">
            {user.roles.map((roleData: any, idx: number) => (
              <Badge key={idx} variant="secondary" className="text-[10px] bg-secondary/40 hover:bg-secondary/60 transition-colors">
                {roleData.role === 'custom' && roleData.custom_role?.name
                  ? roleData.custom_role.name
                  : roleData.role === 'workplace_supervisor'
                    ? 'Workspace Supervisor'
                    : roleData.role.replace(/_/g, ' ')}
              </Badge>
            ))}
            {user.roles.length === 0 && (
              <span className="text-[10px] text-muted-foreground italic">No roles</span>
            )}
          </div>

          {detectedScope === 'department' && (
            <div className="mt-2 pt-2 border-t border-dashed">
              <SpecialtyBadge user={user} />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-4 pt-2 border-t">
            {hasEditPermission && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleEdit(user)}
                className="h-8 text-[11px] sm:text-xs flex-1 px-2"
              >
                <Pencil className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                Edit
              </Button>
            )}
            {(hasDeletePermission && detectedScope === 'department') || isSuperAdmin ? (
              <Button
                variant="destructive-ghost"
                size="sm"
                onClick={() => handleDeleteClick(user.id)}
                disabled={deleteUserMutation.isPending && deleteUserId === user.id}
                className="h-8 text-[11px] sm:text-xs flex-1 px-2"
              >
                <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-1" />
                Remove
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  const SpecialtyBadge = ({ user }: { user: any }) => {
    const departmentRole = user.roles.find((r: any) => r.department_id === detectedScopeId);
    if (!departmentRole?.specialty_id) {
      return <span className="text-[10px] text-muted-foreground">Specialty: Not assigned</span>;
    }

    const specialty = allDepartments?.find((d) => d.id === departmentRole.specialty_id);
    const facilityName = (specialty as any)?.facilities?.name;

    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="font-semibold shrink-0">Specialty:</span>
        <Badge variant="secondary" className="text-[9px] py-0 h-4 px-1">{specialty ? specialty.name : 'Unknown'}</Badge>
        {facilityName && (
          <span className="text-muted-foreground italic truncate">({facilityName})</span>
        )}
      </div>
    );
  };




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
      <div className="space-y-4 w-full max-w-full overflow-x-hidden">
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
          <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg sm:text-xl">
                {isSuperAdmin ? 'Permanently Delete User' : 'Remove User'}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm sm:text-base">
                {isSuperAdmin
                  ? "Are you sure you want to permanently delete this user from the entire system? This action cannot be undone and will remove all their data and access."
                  : "Are you sure you want to remove this user from the department? This action cannot be undone."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel disabled={deleteUserMutation.isPending} className="w-full sm:w-auto mt-0">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteConfirm}
                disabled={deleteUserMutation.isPending}
                className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteUserMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  isSuperAdmin ? 'Delete Permanently' : 'Remove'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>



        <Card className="border-2 shadow-sm overflow-hidden">
          <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4 gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">{scopeTitle}</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <CardDescription className="text-xs sm:text-sm">
                    {scopeDescription}
                  </CardDescription>
                  {maxUsers !== null && maxUsers !== undefined && (
                    <Badge variant="secondary" className="px-1.5 py-0 h-5 font-normal text-[10px] sm:text-xs">
                      {currentUserCount || 0} / {maxUsers} users
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {/* <Button
                  variant="outline"
                  size="icon"
                  onClick={handleManualRefresh}
                  disabled={usersLoading}
                  className="shrink-0 h-10 w-10 sm:h-9 sm:w-9 bg-[#1A1F2C] border-[#2D3139] hover:bg-[#2D3139]"
                  title="Refresh List"
                >
                  <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
                </Button> */}
                {hasEditPermission && (
                  <ActionButton
                    onClick={() => setUnifiedCreateOpen(true)}
                    className="bg-[#6366f1] hover:bg-[#4f46e5] border-none flex-1 sm:flex-none h-10 sm:h-9 px-3 sm:px-6"
                    disabled={isAtUserLimit}
                    title={isAtUserLimit ? 'User limit reached' : undefined}
                  >
                    <UserPlus className="mr-1 h-4 w-4 shrink-0" />
                    <span className="text-sm font-semibold whitespace-nowrap">{detectedScope === 'department' ? 'Add Staff' : 'Create User'}</span>
                  </ActionButton>
                )}
              </div>
            </div>
            {isAtUserLimit && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive font-medium flex items-center gap-2">
                <Lock className="h-4 w-4 shrink-0" />
                <span>User limit reached. Contact admin to increase.</span>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-0 sm:p-6 pt-0">
            {hasBulkUpload && detectedScope === 'system' ? (
              <Tabs defaultValue="list" className="space-y-4 w-full">
                <div className="w-full">
                  <ResponsiveTabsList className="grid grid-cols-2">
                    <TabsTrigger value="list" className="px-2 sm:px-4 text-[11px] sm:text-sm font-medium h-8 sm:h-9">
                      <Filter className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 shrink-0" />
                      User List
                    </TabsTrigger>
                    <TabsTrigger value="bulk" className="px-2 sm:px-4 text-[11px] sm:text-sm font-medium h-8 sm:h-9">
                      <FileSpreadsheet className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2 shrink-0" />
                      Bulk Upload
                    </TabsTrigger>
                  </ResponsiveTabsList>
                </div>

                <TabsContent value="list" className="space-y-4 px-3 sm:px-0">
                  {detectedScope === 'system' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                      <div className="space-y-2 focus-within:text-primary">
                        <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground ml-1">WORKSPACE</Label>
                        <SearchableSelect
                          options={[
                            { value: 'all', label: 'All Workspaces' },
                            ...(workspaces?.map((workspace) => ({ value: workspace.id, label: workspace.name })) || [])
                          ]}
                          value={filterWorkspace}
                          onValueChange={setFilterWorkspace}
                          placeholder="All Workspaces"
                          disabled={!workspaces || workspaces.length === 0}
                        />
                      </div>

                      {isSuperAdmin && (
                        <div className="space-y-2 focus-within:text-primary">
                          <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground ml-1">DEPARTMENT</Label>
                          <SearchableSelect
                            options={[
                              { value: 'all', label: 'All Departments' },
                              ...(allDepartments?.map((department) => ({ value: department.id, label: department.name })) || [])
                            ]}
                            value={filterDepartment}
                            onValueChange={setFilterDepartment}
                            placeholder="All Departments"
                            disabled={!allDepartments || allDepartments.length === 0}
                          />
                        </div>
                      )}
                      {(filterWorkspace !== 'all' || filterDepartment !== 'all') && (
                        <div className="flex items-end pb-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setFilterWorkspace('all');
                              setFilterDepartment('all');
                            }}
                            className="h-10 sm:h-11 text-muted-foreground hover:bg-secondary transition-colors gap-2"
                          >
                            <XCircle className="h-4 w-4" />
                            <span className="text-xs font-semibold uppercase tracking-wider">Clear Filters</span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {/* Mobile-Only Card View */}
                  <div className="md:hidden space-y-3">
                    {filteredProfiles.length > 0 ? (
                      filteredProfiles.map((user: any) => (
                        <UserCard key={user.id} user={user} />
                      ))
                    ) : (
                      <div className="p-8 text-center border-2 border-dashed rounded-lg bg-muted/20">
                        <p className="text-sm text-muted-foreground">No users found</p>
                      </div>
                    )}
                  </div>

                  {/* Desktop-Only Table View */}
                  <div className="hidden md:block">
                    <DataTable
                      data={filteredProfiles}
                      columns={columns}
                      isLoading={usersLoading}
                      error={usersError as Error}
                      searchValue={searchQuery}
                      onSearchChange={setSearchQuery}
                      searchPlaceholder="Search users by name or email..."
                      maxHeight="calc(100vh - 220px)"
                      enableStickyHeader={true}
                      emptyState={{
                        title: 'No users found',
                        description: 'Create your first user to get started.',
                        action: hasEditPermission ? {
                          label: 'Create User',
                          onClick: () => setUnifiedCreateOpen(true),
                        } : undefined,
                      }}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="bulk" className="px-3 sm:px-0 pb-4">
                  <BulkUserUpload organizationId={activeOrganizationId === 'all' ? undefined : activeOrganizationId} />
                </TabsContent>
              </Tabs>
            ) : (
              <div className="space-y-4 px-3 sm:px-0 pt-2 sm:pt-0">
                {detectedScope === 'system' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-2 sm:pb-0">
                    <div className="space-y-2 focus-within:text-primary">
                      <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground ml-1">WORKSPACE</Label>
                      <SearchableSelect
                        options={[
                          { value: 'all', label: 'All Workspaces' },
                          ...(workspaces?.map((workspace) => ({ value: workspace.id, label: workspace.name })) || [])
                        ]}
                        value={filterWorkspace}
                        onValueChange={setFilterWorkspace}
                        placeholder="All Workspaces"
                        disabled={!workspaces || workspaces.length === 0}
                      />
                    </div>

                    {isSuperAdmin && (
                      <div className="space-y-2 focus-within:text-primary">
                        <Label className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground ml-1">DEPARTMENT</Label>
                        <SearchableSelect
                          options={[
                            { value: 'all', label: 'All Departments' },
                            ...(allDepartments?.map((department) => ({ value: department.id, label: department.name })) || [])
                          ]}
                          value={filterDepartment}
                          onValueChange={setFilterDepartment}
                          placeholder="All Departments"
                          disabled={!allDepartments || allDepartments.length === 0}
                        />
                      </div>
                    )}
                    {(filterWorkspace !== 'all' || filterDepartment !== 'all') && (
                      <div className="flex items-end pb-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFilterWorkspace('all');
                            setFilterDepartment('all');
                          }}
                          className="h-10 sm:h-11 text-muted-foreground hover:bg-secondary transition-colors gap-2"
                        >
                          <XCircle className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-wider">Clear Filters</span>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {/* Mobile-Only Card View */}
                <div className="md:hidden space-y-3">
                  {filteredProfiles.length > 0 ? (
                    filteredProfiles.map((user: any) => (
                      <UserCard key={user.id} user={user} />
                    ))
                  ) : (
                    <div className="p-8 text-center border-2 border-dashed rounded-lg bg-muted/20">
                      <p className="text-sm text-muted-foreground">No users found</p>
                    </div>
                  )}
                </div>

                {/* Desktop-Only Table View */}
                <div className="hidden md:block">
                  <DataTable
                    data={filteredProfiles}
                    columns={columns}
                    isLoading={usersLoading}
                    error={usersError as Error}
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search users by name or email..."
                    maxHeight="calc(100vh - 220px)"
                    enableStickyHeader={true}
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rate Limit Activity - Super Admin Only */}
        {isSuperAdmin && detectedScope === 'system' && (
          <Card className="border-2 shadow-sm mt-6 hidden md:block">
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Lock className="h-5 w-5 text-primary" />
                Rate Limit Activity
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Recent security events and blocked requests</CardDescription>
            </CardHeader>
            <CardContent className="p-0 sm:p-6 pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="w-[100px] sm:w-auto">Identifier</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-center">Count</TableHead>
                      <TableHead className="hidden sm:table-cell">Time</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateLimits?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground italic">
                          No rate limit events recorded
                        </TableCell>
                      </TableRow>
                    ) : (
                      rateLimits?.map(limit => (
                        <TableRow key={limit.id} className="hover:bg-muted/10">
                          <TableCell className="font-mono text-[10px] sm:text-xs">
                            {limit.identifier.slice(0, 12)}...
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px] sm:text-xs">{limit.action_type}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={`text - xs font - medium ${(limit.request_count || 0) >= 10 ? 'text-red-500 font-bold' : ''} `}>
                              {limit.request_count}
                            </span>
                          </TableCell>
                          <TableCell className="text-[10px] sm:text-xs text-muted-foreground hidden sm:table-cell">
                            {limit.window_start ? format(new Date(limit.window_start), 'MMM d, HH:mm') : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            {(limit.request_count || 0) >= 10 ? (
                              <Badge className="bg-red-500/20 text-red-500 hover:bg-red-500/30 border-none px-2 py-0 h-5">Blocked</Badge>
                            ) : (
                              <Badge className="bg-green-500/20 text-green-500 hover:bg-green-500/30 border-none px-2 py-0 h-5">Active</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default UnifiedUserHub;
